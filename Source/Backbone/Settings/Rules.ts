import { ITournament } from "../../Models/Tournament";
import { RoundData, PhaseData } from "../Logic/TournamentData";
import { PLAYERS_PER_GROUP, TournamentPhaseType } from "../Config";

export interface RoundConfig {
  MinGameLength: number;
  MaxLength: number;
  MaxGameCount: number;
}

export function GetRulesSettings(DatabaseTournament: ITournament): { phase: PhaseData[] } {
  const AllPhases: PhaseData[] = [];
  const TeamsPerMatch = DatabaseTournament.MaxPlayersPerMatch;
  const IsFFATournament = TeamsPerMatch > 2;

  for (let PhaseIndex = 0; PhaseIndex < DatabaseTournament.Phases.length; PhaseIndex++) {
    const PhaseDataObject = DatabaseTournament.Phases[PhaseIndex];
    const Rounds: RoundData[] = [];

    const PhaseTypeNum = Number(PhaseDataObject.PhaseType) || TournamentPhaseType.SingleEliminationBracket;
    const PhaseType = TournamentPhaseType[PhaseTypeNum] as keyof typeof TournamentPhaseType;

    let RoundsForPhase = PhaseDataObject.RoundCount || DatabaseTournament.RoundCount;
    const IsLastPhase = PhaseIndex === DatabaseTournament.Phases.length - 1;
    const IsPhaseFormat = PhaseType === "RoundRobin" || PhaseType === "Arena";

    if (IsLastPhase) {
      if (PhaseType === "SingleEliminationBracket" || PhaseType === "DoubleEliminationBracket") {
        RoundsForPhase = PhaseDataObject.RoundCount || DatabaseTournament.RoundCount;
        if (RoundsForPhase < 1) RoundsForPhase = 1;
      }
    } else {
      if (PhaseType === "RoundRobin" || PhaseType === "Arena") {
        RoundsForPhase = PhaseDataObject.RoundCount || DatabaseTournament.RoundCount;
      }
    }

    let FFANonFinalDist = "";
    if (IsFFATournament) {
      const PassCount = Math.ceil(TeamsPerMatch / 2);
      const PointsArray = [];

      for (let i = 0; i < TeamsPerMatch; i++) {
        if (i < PassCount) {
          PointsArray.push(TeamsPerMatch - i * 2);
        } else {
          PointsArray.push(-(i - PassCount + 1));
        }
      }
      FFANonFinalDist = PointsArray.join(",");
    }

    for (let I = 1; I <= RoundsForPhase; I++) {
      const IsFinals = IsLastPhase && I === RoundsForPhase && !IsPhaseFormat;

      const Config = GetRoundConfig(DatabaseTournament, PhaseIndex + 1, I);

      const Round: RoundData = {
        "@id": I.toString(),
        "@win-score": "1",
        "@max-game-count": Config.MaxGameCount.toString(),
        "@min-length": Config.MinGameLength.toString(),
        "@max-length": Config.MaxLength.toString(),
      };

      if (IsFinals) {
        if (IsFFATournament) {
          const FinalPointsArray = [];
          for (let i = 0; i < TeamsPerMatch; i++) {
            if (i === 0) {
              FinalPointsArray.push(TeamsPerMatch);
            } else {
              FinalPointsArray.push(-i);
            }
          }
          Round["@match-point-distribution"] = FinalPointsArray.join(",");
        } else {
          Round["@match-point-distribution"] = "2,-1";
        }
      } else if (IsFFATournament && !IsPhaseFormat) {
        Round["@match-point-distribution"] = FFANonFinalDist;
      }

      Rounds.push(Round);
    }

    const CurrentPlayers = PhaseDataObject.MaxTeams || DatabaseTournament.MaxInvites;

    const Phase: PhaseData = {
      "@id": (PhaseIndex + 1).toString(),
      "@type": PhaseDataObject.PhaseType?.toString() ?? "2",
      "@max-players": CurrentPlayers.toString(),
      "@min-teams-per-match": DatabaseTournament.MinPlayersPerMatch.toString(),
      "@max-teams-per-match": DatabaseTournament.MaxPlayersPerMatch.toString(),
      "@min-checkins-per-team": "1",
      "@allow-skip": "0",
      "@game-point-distribution": "1",
      "@match-point-distribution": "1",
      "@allow-tiebreakers": IsFFATournament ? "1" : "0",
      round: Rounds,
    };

    if (PhaseDataObject.IsPhase) {
      Phase["@score-tiebreaker-stats"] = "1";
      Phase["@fill-groups-vertically"] = "0";
      Phase["@force-unique-matches"] = "0";
      Phase["@preferred-rematch-gap"] = "0";
      Phase["@match-point-distribution-custom"] = "1";
      Phase["@group-count"] = PhaseDataObject.GroupCount?.toString() || "1";
      Phase["@allow-tiebreakers"] = "1";
    } else {
      Phase["@max-loses"] = PhaseDataObject?.MaxLoses?.toString() || "1";
    }

    AllPhases.push(Phase);
  }

  return { phase: AllPhases };
}

export function GetRoundConfig(DatabaseTournament: ITournament, PhaseId: number, RoundId: number): RoundConfig {
  const TotalPhases = DatabaseTournament.Phases.length;
  const IsFinalPhase = PhaseId === TotalPhases;

  const PhaseConfig = DatabaseTournament.Phases[PhaseId - 1];
  const PhaseRoundCount = PhaseConfig?.RoundCount || DatabaseTournament.RoundCount;
  const IsFinalRound = RoundId === PhaseRoundCount;

  let MinLength: number;
  let MaxLength: number;

  if (IsFinalPhase && IsFinalRound) {
    MinLength = 10;
    MaxLength = 15;
  } else if (IsFinalPhase) {
    MinLength = 8;
    MaxLength = 12;
  } else {
    MinLength = 6;
    MaxLength = 7;
  }

  return {
    MinGameLength: MinLength,
    MaxLength: MaxLength,
    MaxGameCount: 1,
  };
}

export function GetRoundConfigs(DatabaseTournament: ITournament, PhaseId?: number): Map<number, RoundConfig> {
  const RoundConfigs = new Map<number, RoundConfig>();
  const CurrentPhaseId = PhaseId || DatabaseTournament.CurrentPhaseId || 1;
  const PhaseConfig = DatabaseTournament.Phases[CurrentPhaseId - 1];

  for (let I = 1; I <= 50; I++) {
    RoundConfigs.set(I, GetRoundConfig(DatabaseTournament, CurrentPhaseId, I));
  }

  return RoundConfigs;
}
