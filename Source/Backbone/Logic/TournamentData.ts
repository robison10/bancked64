import { response } from "express";
import { BackboneUser } from "../../Models/BackboneUser";
import { LPUser } from "../../Models/LPUser";
import { Match } from "../../Models/Matches";
import { Tournament } from "../../Models/Tournament";
import { msg } from "../../Modules/Logger";
import { TournamentStatus, TournamentUserStatus, TournamentMatchStatus, TournamentPhaseType } from "../Config";
import { GetNextPhaseStarted, GetProperties } from "../Settings/Properties";
import { GetRulesSettings, GetRoundConfigs } from "../Settings/Rules";
import { GenerateBracketMatches, GetUserMatch, Qualify, GetMatchDeadline, AssignNextMatchIfNeeded } from "./GetMatches";
import { CheckPhases, CreateOrAssignMatch } from "./Internal/Phase";
import { GeneratePrizepoolId } from "../../Modules/Extensions";
import { info } from "console";
import { ResolveMatches } from "./Internal/Resolving";

type PartyMember = {
  userId: string;
  status: number;
  checkIn: boolean;
  isPartyLeader: boolean;
  nick: string;
};

export interface PropertyData {
  "@name": string;
  "@value": string | undefined;
}

export interface RoundData {
  "@id": string;
  "@win-score": string;
  "@max-game-count": string;
  "@min-length": string;
  "@max-length": string;
  "@match-point-distribution"?: string;
}

export interface PhaseData {
  "@id": string;
  "@type": string;
  "@max-players": string;
  "@min-teams-per-match": string;
  "@max-teams-per-match": string;
  "@min-checkins-per-team": string;
  "@allow-skip": string;
  "@max-loses"?: string;
  "@game-point-distribution": string;
  "@match-point-distribution": string;
  "@allow-tiebreakers": string;
  "@score-tiebreaker-stats"?: string;
  "@fill-groups-vertically"?: string;
  "@force-unique-matches"?: string;
  "@group-count"?: string;
  "@match-point-distribution-custom"?: string;
  "@preferred-rematch-gap"?: string;
  round: RoundData[];
}

interface UserMatchResponse {
  id: string;
  secret: string;
  deadline: string;
  matchid: number;
  phaseid: number;
  groupid: number;
  roundid: number;
  playedgamecount: number;
  status: number;
  users: Array<{
    "@user-id": string;
    "@team-id": string;
    "@checked-in": string;
    "@user-score": string;
    "@team-score": string;
    "@user-points": string;
    "@team-points": string;
    "@match-points": string;
    "@match-winner": string;
    "@nick": string;
  }>;
}

interface TournamentDataItem {
  id: number | string;
  type: string | number;
  status: number;
  tournamenttime: string;
  cashStatus: number;
  cashTournament: boolean;
  season: number;
  seasonpart: number;
  invitationopens: string;
  invitationcloses: string;
  maxinvites: number;
  partysize: number;
  currentinvites: number;
  phasecount: number;
  roundcount: number;
  sponsorimage: string;
  sponsorname: string;
  currentphaseid: number;
  currentphasestarted: string | null;
  nextphase: null | string;
  name: string;
  image: null;
  icon: string | undefined | null;
  "theme-color": string | undefined | null;
  data: {
    "tournament-data": {
      "invitation-setting": Array<{
        requirements?: Array<{
          "custom-requirement": Array<{
            "@name": string;
            "@value": string;
          }>;
        }>;
        "entry-fee"?: Array<{
          item: Array<{
            "@amount": string;
            "@type": string;
            "@id": string;
            "@external-id": string;
          }>;
        }>;
      }>;
      "rules-setting": Array<{
        phase: PhaseData[];
      }>;
      "prize-setting": Array<{
        reward: Array<{
          "@position": string;
          item: Array<{
            "@amount": string;
            "@type": string;
            "@id": string;
            "@external-id": string;
          }>;
        }>;
      }>;
      "property-setting": Array<{
        properties: Array<{
          property: PropertyData[];
        }>;
      }>;
      "description-data": Array<{
        language: Array<{
          "@code": string;
          name: Array<{
            "#text": Array<{
              value: string;
            }>;
          }>;
          policy: Array<{
            "@url": string;
          }>;
          general: Array<{
            "@main-icon": string | undefined;
            "@theme-color": string | undefined;
          }>;
        }>;
      }>;
      "sponsor-data": Array<{
        "@name": string;
        "@image": string;
      }>;
      "stream-data": Array<{
        "@stream-link": string;
      }>;
      "winner-data"?: Array<{ user: Array<{ "@user-id": string; "@nick": string }> }>;
    };
  };
  privateCode: null;
  inviteId: string | number | null;
  inviteAceptedAt: string | null;
  inviteDeclinedAt: null;
  inviteStatus: number;
  invitePartyId: unknown;
  inviteIsPartyLeader: boolean;
  invitePartyCode: null | string;
  checkIn: boolean;
  prizeDelivered: null | boolean;
  userPlace: number;
  isAdministrator: boolean;
  openregistration?: number;
}

interface TournamentResponse {
  party: PartyMember[];
  userPosition: unknown[];
  userMatch: UserMatchResponse | null;
  userMatches: UserMatchResponse[];
  tournamentData: TournamentDataItem[];
}
function ToJSON(Obj: any): any {
  if (!Obj) return Obj;
  if (Array.isArray(Obj)) return Obj.map(ToJSON);
  if (typeof Obj !== "object") return Obj;
  if (Obj.toJSON) return Obj.toJSON();
  if (Obj._doc) return ToJSON(Obj._doc);

  const Cleaned: any = {};
  for (const Key in Obj) {
    if (Key.startsWith("$") || Key.startsWith("_") || Key === "__v") continue;
    Cleaned[Key] = ToJSON(Obj[Key]);
  }
  return Cleaned;
}

function FormatMatchDeadline(MatchData: any) {
  if (!MatchData) return null;
  const Clean = ToJSON(MatchData);
  if (Clean.deadline instanceof Date) {
    Clean.deadline = Clean.deadline.toISOString();
  }
  return Clean;
}

async function GetUserData(UserId: string, TournamentId: string): Promise<any> {
  const User = await BackboneUser.findOne({ UserId }).lean();
  if (!User) return null;

  const Data = (User.Tournaments as any).get
    ? (User.Tournaments as any).get(TournamentId)
    : User.Tournaments[TournamentId];
  if (!Data) return null;

  return { ...Data, UserPosition: Data.UserPosition || [] };
}

export async function TournamentGetData(
  TournamentId: number,
  GetAll: number,
  Ready: number,
  Token: string
): Promise<TournamentResponse | { message: string }> {
  const [Tour, LPAccount] = await Promise.all([
    Tournament.findOne({ TournamentId }),
    LPUser.findOne({ AccessToken: Token }).lean(),
  ]);

  if (!Tour || !LPAccount) return { message: "" };

  const User = await BackboneUser.findOne({ UserId: LPAccount.UserId });
  if (!User) return { message: "" };

  const SignedCount = await BackboneUser.countDocuments({
    [`Tournaments.${TournamentId}`]: { $exists: true },
    [`Tournaments.${TournamentId}.SignedUp`]: true,
  });

  if (Tour.CurrentInvites != SignedCount) Tour.CurrentInvites = SignedCount;

  const Opens = new Date(Tour.SignupStart);
  const Starts = new Date(Tour.StartTime);
  const Closes = new Date(Starts.getTime() - 75 * 1000);
  const Now = new Date();

  let Status = TournamentStatus.NotStarted;
  if (Tour.Status !== TournamentStatus.Canceled && Tour.Status !== TournamentStatus.Finished) {
    if (Now < Opens) {
      Status = TournamentStatus.NotStarted;
    } else if (Now <= Closes) {
      Status = TournamentStatus.InvitationOpen;
    } else if (Now < Starts) {
      Status = TournamentStatus.InvitationClose;
      await GenerateBracketMatches(Tour);
    } else {
      if (!Tour.CurrentPhaseStarted) {
        Tour.CurrentPhaseId = 1;
        Tour.CurrentPhaseStarted = new Date();
        Tour.NextPhaseStarted = new Date(Date.now() + (await GetNextPhaseStarted(Tour)));
        await Tour.save();
      }
      Status = TournamentStatus.Running;
      const Phase = Tour.CurrentPhaseId || 1;
      const IsFinalPhase = Phase === Tour.Phases.length;

      if (IsFinalPhase) {
        const AllMatches = await Match.find({
          tournamentid: TournamentId.toString(),
          phaseid: Phase,
          groupid: 0,
        }).lean();

        let LastRoundNumber = 0;
        for (const MatchDoc of AllMatches) {
          if (MatchDoc.roundid > LastRoundNumber) {
            LastRoundNumber = MatchDoc.roundid;
          }
        }

        const LastRoundMatches = AllMatches.filter((m) => m.roundid === LastRoundNumber);
        const AllLastRoundClosed =
          LastRoundMatches.length > 0 &&
          LastRoundMatches.every(
            (m) => m.status === TournamentMatchStatus.Closed || m.status === TournamentMatchStatus.GameFinished
          );

        if (AllLastRoundClosed) {
          Tour.Status = TournamentStatus.Finished;
          Status = TournamentStatus.Finished;
          await Tour.save();
        }
      }
    }
  } else {
    Status = Tour.Status;
  }

  const Response: TournamentResponse = {
    party: [{}] as any,
    userPosition: [],
    userMatch: null,
    userMatches: [],
    tournamentData: [
      {
        id: Tour.TournamentId,
        type: Tour.TournamentType,
        status: Status,
        tournamenttime: Tour.StartTime.toISOString(),
        cashStatus: 0,
        cashTournament: false,
        season: 1,
        seasonpart: 1,
        invitationopens: Tour.SignupStart.toISOString(),
        invitationcloses: Closes.toISOString(),
        maxinvites: Tour.MaxInvites,
        partysize: Tour.PartySize,
        currentinvites: Tour.CurrentInvites,
        phasecount: Tour.Phases.length,
        roundcount: Tour.RoundCount,
        sponsorimage: "",
        sponsorname: "",
        currentphaseid: Tour.CurrentPhaseId || 0,
        currentphasestarted: Tour.CurrentPhaseStarted?.toISOString() || null,
        nextphase: Tour.NextPhaseStarted?.toISOString() || null,
        name: Tour.TournamentName,
        image: null,
        icon: Tour.TournamentImage,
        "theme-color": Tour.TournamentColor,
        data: {
          "tournament-data": {
            "invitation-setting": [
              {
                requirements: [
                  { "custom-requirement": [{ "@name": "server_region", "@value": Tour.Region.toLowerCase() }] },
                ],
              },
            ],
            "rules-setting": [GetRulesSettings(Tour)],
            "prize-setting": [
              {
                reward: [
                  {
                    "@position": "1",
                    item: [{ "@amount": "1", "@type": "10", "@id": "1019395748292202883", "@external-id": "10" }],
                  },
                ],
              },
            ],
            "property-setting": GetProperties(Tour),
            "description-data": [
              {
                language: [
                  {
                    "@code": "en",
                    name: [{ "#text": [{ value: Tour.TournamentName }] }],
                    policy: [{ "@url": "" }],
                    general: [{ "@main-icon": Tour.TournamentImage, "@theme-color": Tour.TournamentColor }],
                  },
                ],
              },
            ],
            "sponsor-data": [{ "@name": "", "@image": "" }],
            "stream-data": [{ "@stream-link": Tour.Properties.StreamURL ?? "" }],
            "winner-data":
              (Tour.Winners?.length ?? 0) > 0
                ? [{ user: (Tour.Winners ?? []).map((W: any) => ({ "@user-id": W.userId, "@nick": W.nick })) }]
                : undefined,
          },
        },
        privateCode: null,
        inviteId: null,
        inviteAceptedAt: null,
        inviteDeclinedAt: null,
        inviteStatus: TournamentUserStatus.Confirmed,
        invitePartyId: null,
        inviteIsPartyLeader: false,
        invitePartyCode: null,
        checkIn: true,
        prizeDelivered: null,
        userPlace: 0,
        isAdministrator: false,
      },
    ],
  };

  const Info = User.Tournaments?.get(TournamentId.toString());
  const IsAdmin = Tour.Properties.AdminIds.includes(User.UserId);
  const IsInviteOnly = Tour.Properties?.IsInvitationOnly;
  const IsInvited = IsInviteOnly && Tour.Properties?.InvitedIds?.includes(User.UserId);
  if (IsAdmin) Response.tournamentData[0].isAdministrator = true;
  if ((IsInviteOnly && IsInvited) || !IsInviteOnly) Response.tournamentData[0].openregistration = 0;

  if (Tour.EntryFee && Tour.EntryFee > 0) {
    Response.tournamentData[0].data["tournament-data"]["invitation-setting"].push({
      "entry-fee": [
        {
          item: [
            {
              "@amount": Tour.EntryFee.toString(),
              "@type": "10",
              "@id": Tour.PrizepoolId?.toString() || "null",
              "@external-id": "4",
            },
          ],
        },
      ],
    });
  }

  if (!Info?.SignedUp) return Response;

  if (IsInviteOnly && !IsInvited) {
    Info.SignedUp = false;
    await Promise.all([
      User.save(),
      Tournament.updateOne({ TournamentId: Tour.TournamentId }, { $inc: { CurrentInvites: -1 } }),
    ]);
    return Response;
  }

  Response.tournamentData[0].inviteId = Info.InviteId?.toString() || null;
  Response.tournamentData[0].invitePartyId = Info.InviteId?.toString() || null;
  if (Tour.PartySize > 1) Response.tournamentData[0].invitePartyCode = Info.PartyCode || null;
  Response.tournamentData[0].inviteStatus = TournamentUserStatus.Confirmed;
  Response.tournamentData[0].inviteAceptedAt = Info.AcceptedAt.toISOString();
  Response.tournamentData[0].checkIn = true;
  if (Info.PartyMembers) {
    Response.party = Info.PartyMembers.map((PartyUser: any) => ({
      userId: PartyUser.UserId.toString(),
      status: PartyUser.Status,
      checkIn: true,
      isPartyLeader: PartyUser.IsPartyLeader,
      nick: PartyUser.Username,
    }));

    if (User.Username !== Response.party.find((p) => p.userId === User.UserId)?.nick) {
      const TeammatesUserIds = Info.PartyMembers.map((pm: any) => pm.UserId);
      const DatabaseTeammates = await BackboneUser.find({ UserId: { $in: TeammatesUserIds } }).lean();

      Info.PartyMembers = Info.PartyMembers.map((pm: any) => {
        const fresh = DatabaseTeammates.find((u) => u.UserId === pm.UserId);
        return fresh ? { ...pm, Username: fresh.Username } : pm;
      });

      Response.party = Info.PartyMembers.map((PartyUser: any) => ({
        userId: PartyUser.UserId.toString(),
        status: PartyUser.Status,
        checkIn: true,
        isPartyLeader: PartyUser.IsPartyLeader,
        nick: PartyUser.Username,
      }));

      await User.save();
    }

    const CurrentUser = Info.PartyMembers.find((PartyUser: any) => PartyUser.UserId === User.UserId);
    if (CurrentUser) {
      Response.tournamentData[0].inviteIsPartyLeader = CurrentUser.IsPartyLeader;
      if (Info.PartyMembers.some((any) => any.IsKicked))
        Response.tournamentData[0].inviteStatus = TournamentUserStatus.KickedOutByAdmin;
    }
  }

  if (Now < Starts) {
    await Promise.all([Tour.save(), User.save()]);
    return Response;
  }

  if (
    User.Tournaments?.get(Tour.TournamentId.toString())?.PartyMembers?.length !== Tour.PartySize &&
    Info.PartyMembers
  ) {
    Info.PartyMembers.forEach((PartyUser: any) => (PartyUser.Status = TournamentUserStatus.PartyNotFull));
    Response.tournamentData[0].inviteStatus = TournamentUserStatus.PartyNotFull;
  }

  const Phase = Tour.CurrentPhaseId || 1;
  const UserData = await GetUserData(User.UserId, TournamentId.toString());
  Response.userPosition = UserData ? UserData.UserPosition : [];

  if (GetAll === 0) {
    Response.party = [];
    Response.tournamentData = [];
  }

  const DatabaseMatch = await GetUserMatch(User, Tour);
  Response.userMatch = FormatMatchDeadline(DatabaseMatch);

  if (Info.UserMatch && Info.UserMatch.id) {
    const ValidateMatch = await Match.findOne({
      id: Info.UserMatch.id,
      status: { $in: [TournamentMatchStatus.Closed, TournamentMatchStatus.GameFinished] },
    }).lean();

    if (ValidateMatch) {
      Info.UserMatch = null;
      await BackboneUser.updateOne(
        { UserId: User.UserId },
        { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: null } }
      );
      Response.userMatch = null;
    }
  }

  if (Info.UserMatches?.length > 0) {
    Response.userMatches = Info.UserMatches.map((OldMatches: any) => FormatMatchDeadline(OldMatches));
  }

  if (Ready === 0 && Response.userMatch) {
    const UpdatedMatch = await Match.findOne({ id: Response.userMatch.id }).lean();
    if (UpdatedMatch) {
      Response.userMatch = FormatMatchDeadline(UpdatedMatch);

      await BackboneUser.findOneAndUpdate(
        { UserId: User.UserId },
        { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: Response.userMatch } }
      );
    }
  }

  if (Ready === 1 && GetAll === 1) {
    const PhaseConfig = Tour.Phases[Phase - 1];
    const TypeNum = Number(PhaseConfig.PhaseType) || TournamentPhaseType.SingleEliminationBracket;
    const PhaseType = TournamentPhaseType[TypeNum] as keyof typeof TournamentPhaseType;

    if (PhaseType !== "RoundRobin" && PhaseType !== "Arena") {
      const Pos = Info.UserPosition?.find((Pos: any) => Pos.phaseid === Phase);
      if (Pos && Pos.matchloses > 0) {
        Info.KnockedOut = true;
      }
    }

    if (!Response.userMatch && !Info.KnockedOut) {
      await AssignNextMatchIfNeeded(User, Tour);
      const NewMatch = await GetUserMatch(User, Tour);
      if (NewMatch) Response.userMatch = FormatMatchDeadline(NewMatch);
    }
  }

  if (Ready === 1 && GetAll === 0 && Response.userMatch) {
    const PhaseConfig = Tour.Phases[Phase - 1];
    const TypeNum = Number(PhaseConfig.PhaseType) || TournamentPhaseType.SingleEliminationBracket;
    const PhaseType = TournamentPhaseType[TypeNum] as keyof typeof TournamentPhaseType;

    if (PhaseType !== "RoundRobin" && PhaseType !== "Arena") {
      const Pos = Info.UserPosition?.find((Pos: any) => Pos.phaseid === Phase);
      if (Pos && Pos.matchloses > 0) {
        Info.KnockedOut = true;
      }
    }

    if (Info.KnockedOut) {
      Response.userMatch = null;
      if (Info.UserMatches?.length > 0) {
        Response.userMatches = Info.UserMatches.map((HistoryMatch: any) => FormatMatchDeadline(HistoryMatch));
      }
      const UserData = await GetUserData(User.UserId, TournamentId.toString());
      Response.userPosition = UserData ? UserData.UserPosition : [];
      await Promise.all([Tour.save(), User.save()]);
      return ToJSON(Response);
    }

    const CurrentMatch = await Match.findOne({ id: Response.userMatch.id }).lean();
    if (!CurrentMatch) {
      Response.userMatch = null;
      await BackboneUser.findOneAndUpdate(
        { UserId: User.UserId },
        { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: null } }
      );
      await Promise.all([Tour.save(), User.save()]);
      return ToJSON(Response);
    }

    if (
      CurrentMatch.status === TournamentMatchStatus.Closed ||
      CurrentMatch.status === TournamentMatchStatus.GameFinished
    ) {
      Response.userMatch = null;
      await BackboneUser.findOneAndUpdate(
        { UserId: User.UserId },
        { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: null } }
      );
      await Promise.all([Tour.save(), User.save()]);
      return ToJSON(Response);
    }

    const UserInMatch = CurrentMatch.users.find((MatchUser: any) => MatchUser["@user-id"] === User.UserId);
    if (!UserInMatch) {
      Response.userMatch = null;
      await BackboneUser.findOneAndUpdate(
        { UserId: User.UserId },
        { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: null } }
      );
      await Promise.all([Tour.save(), User.save()]);
      return ToJSON(Response);
    }

    const WinnerInMatch = CurrentMatch.users.find((MatchUser: any) => MatchUser["@match-winner"] === "1");
    if (WinnerInMatch) {
      const WinnerId = WinnerInMatch["@user-id"];
      const Winner = await BackboneUser.findOne({ UserId: WinnerId });
      if (Winner) {
        await Qualify(Winner, Tour);

        if (WinnerId === User.UserId) {
          const UpdatedUser = await BackboneUser.findOne({ UserId: User.UserId });
          const UpdatedInfo = UpdatedUser?.Tournaments.get(Tour.TournamentId.toString());

          if (UpdatedInfo) {
            const NewMatch = await GetUserMatch(UpdatedUser!, Tour);
            Response.userMatch = FormatMatchDeadline(NewMatch);

            if (NewMatch) {
              await BackboneUser.findOneAndUpdate(
                { UserId: UpdatedUser!.UserId },
                { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: FormatMatchDeadline(NewMatch) } }
              );
            }

            if (UpdatedInfo.UserMatches?.length > 0) {
              Response.userMatches = UpdatedInfo.UserMatches.map((HistoryMatch: any) =>
                FormatMatchDeadline(HistoryMatch)
              );
            }
          }
        }
      }
      await Promise.all([Tour.save(), User.save()]);
      return ToJSON(Response);
    }

    if (UserInMatch["@checked-in"] === "1") {
      const Configs = GetRoundConfigs(Tour);
      const Deadline = GetMatchDeadline(CurrentMatch, Tour, Configs);
      const GracePeriod = new Date(Deadline.getTime() + 5000);
      const IsPassed = Now >= GracePeriod;

      if (IsPassed) {
        const CheckedInUsers = CurrentMatch.users.filter((MatchUser: any) => MatchUser["@checked-in"] === "1");
        const PartyIds = Info.PartyMembers?.map((PartyUser: any) => PartyUser.UserId.toString()) || [User.UserId];

        const AllPartyCheckedIn = PartyIds.every((PartyId: string) =>
          CheckedInUsers.some((CheckedUser: any) => CheckedUser["@user-id"] === PartyId)
        );

        const OtherTeamsCheckedIn = CurrentMatch.users.some(
          (MatchUser: any) => !PartyIds.includes(MatchUser["@user-id"]) && MatchUser["@checked-in"] === "1"
        );

        if (AllPartyCheckedIn && !OtherTeamsCheckedIn) {
          const UpdatedUsers = CurrentMatch.users.map((MatchUser: any) => {
            if (PartyIds.includes(MatchUser["@user-id"])) {
              return { ...MatchUser, "@match-winner": "1", "@match-points": "1", "@team-score": "1" };
            }
            return { ...MatchUser, "@match-winner": "0", "@match-points": "0", "@team-score": "0" };
          });

          await Match.updateOne(
            {
              id: Response.userMatch!.id,
              status: { $nin: [TournamentMatchStatus.Closed, TournamentMatchStatus.GameFinished] },
            },
            { $set: { users: UpdatedUsers, status: TournamentMatchStatus.Closed } }
          );

          await Qualify(User, Tour);

          const UpdatedUser = await BackboneUser.findOne({ UserId: User.UserId });
          const UpdatedInfo = UpdatedUser?.Tournaments.get(Tour.TournamentId.toString());

          if (UpdatedInfo) {
            const NewMatch = await GetUserMatch(UpdatedUser!, Tour);
            Response.userMatch = FormatMatchDeadline(NewMatch);

            if (NewMatch) {
              await BackboneUser.findOneAndUpdate(
                { UserId: UpdatedUser!.UserId },
                { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: FormatMatchDeadline(NewMatch) } }
              );
            }

            if (UpdatedInfo.UserMatches?.length > 0) {
              Response.userMatches = UpdatedInfo.UserMatches.map((HistoryMatch: any) =>
                FormatMatchDeadline(HistoryMatch)
              );
            }
          }

          await Promise.all([Tour.save(), User.save()]);
          return ToJSON(Response);
        }
      }

      const RefreshedMatch = await Match.findOne({ id: Response.userMatch.id }).lean();
      Response.userMatch = FormatMatchDeadline(RefreshedMatch);
      await Promise.all([Tour.save(), User.save()]);
      return ToJSON(Response);
    }

    await Match.updateOne(
      {
        id: Response.userMatch.id,
        status: { $nin: [TournamentMatchStatus.Closed, TournamentMatchStatus.GameFinished] },
      },
      { $set: { "users.$[elem].@checked-in": "1" } },
      { arrayFilters: [{ "elem.@user-id": User.UserId.toString() }] }
    );

    const FreshMatch = await Match.findOne({ id: Response.userMatch.id }).lean();
    if (FreshMatch) {
      Response.userMatch = FormatMatchDeadline(FreshMatch);

      await BackboneUser.findOneAndUpdate(
        { UserId: User.UserId },
        { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: FormatMatchDeadline(FreshMatch) } }
      );

      if (FreshMatch.status === TournamentMatchStatus.WaitingForOpponent) {
        const UniqueTeams = new Set(FreshMatch.users.map((U: any) => U["@team-id"]).filter((T: string) => T));
        if (UniqueTeams.size === Tour.MaxPlayersPerMatch) {
          const Configs = GetRoundConfigs(Tour);
          const Config = Configs.get(FreshMatch.roundid);

          let NewDeadline: Date;
          if (Config) {
            const GameCount = Config.MaxGameCount;
            const TotalMinutes = GameCount * Config.MinGameLength;
            const AdjustedMinutes = TotalMinutes === Config.MaxLength ? TotalMinutes - 1 : TotalMinutes;
            const SubtractedTime = AdjustedMinutes * 60 * 1000 + 15000;
            const CheckInTime = 2.5 * 60 * 1000;

            NewDeadline = new Date(Date.now() + CheckInTime + SubtractedTime);
          } else {
            NewDeadline = new Date(Date.now() + 2.5 * 60 * 1000);
          }

          await Match.updateOne(
            { id: FreshMatch.id, status: TournamentMatchStatus.WaitingForOpponent },
            {
              $set: {
                status: TournamentMatchStatus.GameReady,
                deadline: NewDeadline,
              },
            }
          );

          const UpdatedFreshMatch = await Match.findOne({ id: FreshMatch.id }).lean();
          if (UpdatedFreshMatch) {
            Response.userMatch = FormatMatchDeadline(UpdatedFreshMatch);

            await BackboneUser.findOneAndUpdate(
              { UserId: User.UserId },
              { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: FormatMatchDeadline(UpdatedFreshMatch) } }
            );
          }
        }
      }
    }
  } else if (Info.UserMatch && !Info.UserMatch.id) {
    const DatabaseMatch = await GetUserMatch(User, Tour);
    if (DatabaseMatch) {
      await BackboneUser.findOneAndUpdate(
        { UserId: User.UserId },
        { $set: { [`Tournaments.${Tour.TournamentId}.UserMatch`]: FormatMatchDeadline(DatabaseMatch) } }
      );
    }
  }

  if (Info.KnockedOut || Info.PartyMembers.some((me) => me.UserId == User.UserId && me.IsKicked)) {
    Response.userMatch = null;
    if (Info.UserMatches?.length > 0) {
      Response.userMatches = Info.UserMatches.map((Match: any) => FormatMatchDeadline(Match));
    }
    const UserData = await GetUserData(User.UserId, TournamentId.toString());
    Response.userPosition = UserData ? UserData.UserPosition : [];
  }

  if (Info.FinalPlace > 0 && Tour.Winners) {
    Response.tournamentData[0].userPlace = Info.FinalPlace;
    Response.tournamentData[0].prizeDelivered = true;
  }

  await Promise.all([Tour.save(), User.save()]);
  return ToJSON(Response);
}
