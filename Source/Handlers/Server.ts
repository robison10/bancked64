import e, { NextFunction, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";
import { BODY_SIZE_LIMIT, IS_DEBUG, PORT, PROJECT_NAME } from "../Modules/Constants";
import { msg, warn, toGradient } from "../Modules/Logger";
import { gray, italic, magenta, red } from "colorette";
import { E_NotFound, E_ServerError } from "../Modules/Errors";
import { GeneratePrizepoolId, Register } from "../Modules/Extensions";
import mongoose from "mongoose";
import { CreateSignedUpUser, CreateTournament } from "./Database";
import { Emotes, IS_MAINTENANCE, Scenes, TournamentPhaseType } from "../Backbone/Config";
import { Qualify } from "../Backbone/Logic/GetMatches";
import { Tournament } from "../Models/Tournament";
import { BackboneUser } from "../Models/BackboneUser";
import { StartLoop } from "../Backbone/Logic/Internal/Resolving";
import { Bot } from "./Bot";
import { EncryptResponse } from "../Modules/Middleware";
import { TournamentScheduler } from "./Scheduler";
import { TournamentCleaner } from "./Deleter";

export const App = e()
  .disable("etag")
  .disable("x-powered-by")
  .use(e.json({ limit: BODY_SIZE_LIMIT }))
  .use(e.urlencoded({ limit: BODY_SIZE_LIMIT, extended: false }))
  .use(cors({ origin: "*" }));
// .use(EncryptResponse);

function createDate(year: number, month: number, day: number, hours: number, minutes: number = 0): Date {
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function MakeGradient(): [string, string] {
  const BaseHue = Math.floor(Math.random() * 360);
  const BaseSaturation = 70 + Math.random() * 20;
  const BaseLightness = 50 + Math.random() * 15;

  const EndHue = (BaseHue + 15 + Math.random() * 30) % 360;
  const EndSaturation = BaseSaturation + (Math.random() * 10 - 5);
  const EndLightness = BaseLightness + (Math.random() * 20 - 10);

  return [ConvertToHex(BaseHue, BaseSaturation, BaseLightness), ConvertToHex(EndHue, EndSaturation, EndLightness)];
}

function ConvertToHex(H: number, S: number, L: number): string {
  const Saturation = S / 100;
  const Lightness = L / 100;

  const C = (1 - Math.abs(2 * Lightness - 1)) * Saturation;
  const X = C * (1 - Math.abs(((H / 60) % 2) - 1));
  const M = Lightness - C / 2;

  let R = 0,
    G = 0,
    B = 0;

  if (H >= 0 && H < 60) {
    R = C;
    G = X;
    B = 0;
  } else if (H >= 60 && H < 120) {
    R = X;
    G = C;
    B = 0;
  } else if (H >= 120 && H < 180) {
    R = 0;
    G = C;
    B = X;
  } else if (H >= 180 && H < 240) {
    R = 0;
    G = X;
    B = C;
  } else if (H >= 240 && H < 300) {
    R = X;
    G = 0;
    B = C;
  } else {
    R = C;
    G = 0;
    B = X;
  }

  const ToHex = (V: number) =>
    Math.round((V + M) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ToHex(R)}${ToHex(G)}${ToHex(B)}`;
}

async function LoadRoutes(
  Dir: string,
  Routes: Array<{ Path: string; Module: any }> = []
): Promise<Array<{ Path: string; Module: any }>> {
  const Entries = await fs.readdir(Dir, { withFileTypes: true });

  await Promise.all(
    Entries.map(async (Entry) => {
      const FullPath = path.join(Dir, Entry.name);

      if (Entry.isDirectory()) {
        await LoadRoutes(FullPath, Routes);
      } else if (Entry.isFile() && (Entry.name.endsWith(".ts") || Entry.name.endsWith(".js"))) {
        try {
          const Module = await import(path.resolve(FullPath));
          if (Module.default?.App) {
            Routes.push({ Path: Entry.name, Module: Module.default });
          }
        } catch (Err) {
          warn(`Failed loading ${italic(Entry.name)}: ${(Err as Error).message}`);
        }
      }
    })
  );

  return Routes;
}

async function Start() {
  const RoutesDir = path.join(__dirname, "..", "Routes");

  const [DbConnection, RoutesList] = await Promise.all([
    mongoose.connect(process.env.DATABASE_URI || "", {
      retryWrites: true,
      w: 'majority'
    }),
    LoadRoutes(RoutesDir),
  ]);

  App.use((Req: Request, Res: Response, Next: NextFunction) => {
    if (IS_MAINTENANCE) {
      return Res.status(503).json({
        message: "Servers are currently on maintenance. Please try again later.",
      });
    }
    Next();
  });

  App.use(Register);

  for (const { Path, Module } of RoutesList) {
    const MountPath = Module.DefaultAPI || "/";
    App.use(MountPath, Module.App);
    const [Start, End] = MakeGradient();
    msg(`Loaded ${italic(toGradient(Path, Start, End))}`);
  }

  App.use((Req, Res) => Res.error(E_NotFound, Req.path));
  App.use((Err: Error, Req: Request, Res: Response, Next: NextFunction) => {
    console.error(Err);
    Res.error(E_ServerError);
  });

  msg(`Connected to ${gray(PROJECT_NAME)} database`);
  await Bot.login(process.env.BOT_TOKEN);
  App.listen(PORT, () => {
    const [Start, End] = MakeGradient();
    StartLoop();
    msg(
      `${toGradient(PROJECT_NAME, Start, End)} running on port ${magenta(PORT.toString())} ${
        IS_DEBUG ? red("(debug)") : ""
      }`
    );
  });

  const StartTime = new Date(new Date().getTime() + 4 * 60 * 1000);
  const TourId = new Date().getTime().toString();

  await CreateTournament({
      CurrentInvites: 0,
      MaxInvites: 4,
      TournamentId: TourId,
      TournamentName: "Test Tournament 1v1 - SA",
      TournamentImage: "https://media.discordapp.net/attachments/1462880675320434780/1464744114850631793/f468e024b96045fdb7d2ba3ae3566a1b.png?ex=697694c2&is=69754342&hm=d1a24ed6074e190efbbf836a26d31e54759ce9ed67d1685017d705e0dd62527e&=&format=webp&quality=lossless&width=440&height=440",
      TournamentColor: "#fc0303",
      StartTime: StartTime,
      SignupStart: new Date(new Date().getTime() + 2 * 60 * 1000),
      EntryFee: 0,
      PrizepoolId: GeneratePrizepoolId().toString(),
      PartySize: 1,
      Status: 1,
      TournamentType: 0,
      Phases: [
        {
          PhaseType: TournamentPhaseType.SingleEliminationBracket,
          IsPhase: false,
          RoundCount: 2,
          MaxTeams: 4,
          Maps: [Scenes["Block Dash Legendary"]],
        },
      ],
      Region: "sa",
      RoundCount: 2,
      CurrentPhaseId: 0,
      Properties: {
        IsInvitationOnly: false,
        InvitedIds: ["804967", "100775"],
        DisabledEmotes: [Emotes["Punch Only"]],
        AdminIds: ["848"],
        StreamURL: "",
      },
      MinPlayersPerMatch: 1,
      MaxPlayersPerMatch: 2,
    });

  TournamentScheduler.Start();
  TournamentCleaner.Start();
  /*await TournamentScheduler.ScheduleOnce(
    {
      CurrentInvites: 0,
      MaxInvites: 32,
      TournamentId: TourId,
      TournamentName: "StumblePrix 1v1v1v1 - EU",
      TournamentImage: "https://files.catbox.moe/wvas0o.jpg",
      TournamentColor: "#e9a811ff",
      StartTime: StartTime,
      SignupStart: new Date(new Date().getTime() + 0 * 60 * 1000),
      EntryFee: 0,
      PrizepoolId: GeneratePrizepoolId().toString(),
      PartySize: 1,
      Status: 1,
      TournamentType: 0,
      Phases: [
        {
          PhaseType: TournamentPhaseType.SingleEliminationBracket,
          IsPhase: false,
          RoundCount: 4,
          MaxTeams: 32,
          Maps: [Scenes["Block Dash"]],
        },
      ],
      Region: "eu",
      RoundCount: 4,
      CurrentPhaseId: 0,
      Properties: {
        IsInvitationOnly: false,
        InvitedIds: ["804967", "100775"],
        DisabledEmotes: [Emotes["Punch Only"]],
        AdminIds: ["848"],
        StreamURL: "https://discord.gg/kPdszPqN",
      },
      MinPlayersPerMatch: 2,
      MaxPlayersPerMatch: 4,
    },
    createDate(2025, 12, 6, 19, 0),
    { signupStartMinutes: 5, tournamentStartMinutes: 15 }
  );*/
  // CreateSignedUpUser(1, TourId);
}

Start().catch((Err) => {
  console.error("Tournament-SDK initialization failed :( --> (cause):", Err);
  process.exit(1);
});

export { mongoose };
