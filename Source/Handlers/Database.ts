import { BackboneUser } from "../Models/BackboneUser";
import { Tournament, TournamentInput } from "../Models/Tournament";
import { v4 as uuidv4 } from "uuid";
import { msg } from "../Modules/Logger";
import { GenerateInviteId } from "../Modules/Extensions";
import { TournamentPhaseType, Scenes, Emotes } from "../Backbone/Config";

const WEBHOOK_URI = process.env.WEBHOOK_URI || "";

function getMapFriendlyName(sceneId: string): string {
  const mapName = Object.keys(Scenes).find((key) => Scenes[key as keyof typeof Scenes] === sceneId);
  return mapName || sceneId;
}

function getEmoteFriendlyName(emoteId: number): string {
  const emoteName = Object.keys(Emotes).find((key) => Emotes[key as keyof typeof Emotes] === emoteId);
  return emoteName || `${emoteId}`;
}

async function SendWebhook(tournament: any): Promise<void> {
  if (!WEBHOOK_URI) {
    return;
  }

  try {
    const hexColor = tournament.TournamentColor?.replace("#", "") || "daef20";
    const decimalColor = parseInt(hexColor.substring(0, 6), 16);

    const isFFA = tournament.PartySize === 1 && tournament.MaxPlayersPerMatch > 2;
    const modeText = isFFA
      ? Array(tournament.MaxPlayersPerMatch).fill("1").join("v")
      : `${tournament.PartySize}v${tournament.PartySize}`;

    const getPhaseTypeName = (phaseType: number): string => {
      switch (phaseType) {
        case TournamentPhaseType.RoundRobin:
          return "Normal Phase (Round Robin)";
        case TournamentPhaseType.Arena:
          return "Arena";
        case TournamentPhaseType.SingleEliminationBracket:
          return "Bracket (Single Elimination)";
        default:
          return "Phase";
      }
    };

    const disabledEmotes = tournament.Properties?.DisabledEmotes || [];
    const emotesText =
      disabledEmotes.length > 0
        ? disabledEmotes.map((emoteId: number) => getEmoteFriendlyName(emoteId)).join(", ")
        : "All Enabled";

    const signupTimestamp = Math.floor(new Date(tournament.SignupStart).getTime() / 1000);
    const startTimestamp = Math.floor(new Date(tournament.StartTime).getTime() / 1000);

    const components = [
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `@everyone\n\n<:sgclassic:1463203152487518322> - A new **Classic Tournament** has been created on ***StumbleClassic <:sgclassic:1463203152487518322> ***`,
          },
        ],
        accessory: {
          type: 11,
          media: {
            url:
              tournament.TournamentImage ||
              "https://media.discordapp.net/attachments/1462880675320434780/1464744114850631793/f468e024b96045fdb7d2ba3ae3566a1b.png?ex=697694c2&is=69754342&hm=d1a24ed6074e190efbbf836a26d31e54759ce9ed67d1685017d705e0dd62527e&=&format=webp&quality=lossless&width=440&height=440",
          },
        },
      },
      {
        type: 14,
      },
      {
        type: 10,
        content: `<:Dot:1464744731593544013> Tournament Name: **${
          tournament.TournamentName
        }**\n<:Dot:1464744731593544013> Region: **${tournament.Region.toUpperCase()}**\n<:Dot:1464744731593544013> Emotes: **${emotesText}**\n<:Dot:1464744731593544013> Tournament Mode: **${modeText}**\n<:Dot:1464744731593544013> Tournament Max Invites: **${
          tournament.MaxInvites
        }**\n<:Dot:1464744731593544013> Tournament Phases: **${
          tournament.Phases?.length || 0
        }**\n<:Dot:1464744731593544013> Signup Opens: <t:${signupTimestamp}:R>\n<:Dot:1464744731593544013> Tournament Starts: <t:${startTimestamp}:R>\n\n`,
      },
      {
        type: 14,
        divider: true,
      },
    ];

    if (tournament.Phases && tournament.Phases.length > 0) {
      tournament.Phases.forEach((phase: any, index: number) => {
        const phaseTypeName = getPhaseTypeName(Number(phase.PhaseType));
        const mapNames =
          phase.Maps && phase.Maps.length > 0
            ? phase.Maps.map((sceneId: string) => getMapFriendlyName(sceneId)).join(", ")
            : "NA";

        let phaseContent = `<:sgclassic:1463203152487518322> - Phase ${index + 1}: **${phaseTypeName}** <:sgclassic:1463203152487518322>\n`;

        if (phase.MaxTeams) {
          phaseContent += `<:Dot:1464744731593544013> Max Teams: **${phase.MaxTeams}**\n`;
        }

        phaseContent += `<:Dot:1464744731593544013> Maps: **${mapNames}**\n`;

        if (phase.RoundCount) {
          phaseContent += `<:Dot:1464744731593544013> Rounds: **${phase.RoundCount}**\n`;
        }

        if (phase.GroupCount && phase.GroupCount > 1) {
          phaseContent += `<:Dot:1464744731593544013> Passing Teams: **${phase.GroupCount}**\n`;
        }

        components.push({
          type: 10,
          content: phaseContent,
        });

        if (index < tournament.Phases.length - 1) {
          components.push({
            type: 14,
          });
        }
      });
    }

    const payload = {
      type: 0,
      flags: 32768,
      components: [
        {
          type: 17,
          components: components,
          accent_color: decimalColor,
        },
      ],
    };

    const webhookUrl =
      WEBHOOK_URI.replace("https://discord.com/api/webhooks/", "https://discord.com/api/v10/webhooks/") +
      "?wait=true&with_components=true";

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook failed: ${response.status} - ${errorText}`);
    }
  } catch (err) {
    throw err;
  }
}

export async function CreateTournament(tournamentData: TournamentInput) {
  let signupStart = tournamentData.SignupStart ?? new Date(tournamentData.StartTime.getTime() - 60 * 60 * 1000);

  const tournament = new Tournament({
    ...tournamentData,
    SignupStart: signupStart,
  });

  const saved = await tournament.save();

  // Send webhook asynchronously to not block tournament creation
  SendWebhook(saved).catch((err) => {
    console.error("Webhook failed:", err);
  });

  return saved;
}

async function GenerateUserId(): Promise<string> {
  const UsersCollection = BackboneUser.collection;

  let unique = false;
  let userId = "";

  while (!unique) {
    userId = Math.floor(10000 + Math.random() * 90000).toString();
    const exists = await UsersCollection.findOne({ UserId: userId });
    if (!exists) unique = true;
  }

  return userId;
}

export async function CreateSignedUpUser(Times: number, TournamentId: string) {
  const users = [];
  const DBTour = await Tournament.findOne({ TournamentId });

  if (!DBTour) {
    msg("Please provide a valid tournamentid :)");
    return;
  }

  const partySize = DBTour.PartySize;

  for (let i = 0; i < Times / partySize; i++) {
    const partyCode = uuidv4();
    const partyMembers = [];
    const AcceptedAt = new Date();

    for (let j = 0; j < partySize; j++) {
      const UserId = await GenerateUserId();
      const Username = `Tournament-SDK #${Math.random().toString(36).substring(2, 8)}`;
      const IsPartyLeader = j === 0;

      partyMembers.push({
        UserId,
        Username,
        Status: 1,
        IsPartyLeader,
      });
    }

    for (const member of partyMembers) {
      const user = new BackboneUser({
        Username: member.Username,
        UserId: member.UserId,
        Tournaments: {
          [TournamentId]: {
            SignedUp: true,
            InviteId: GenerateInviteId(),
            Status: 1,
            AcceptedAt,
            PartyCode: partyCode,
            KnockedOut: false,
            PartyMembers: partyMembers,
            UserMatch: null,
            UserMatches: [],
            UserPosition: [],
            FinalPlace: 0,
          },
        },
      });

      users.push(user.save());
    }
  }

  return await Promise.all(users);
}
