import mongoose, { Schema, Document } from "mongoose";
import { TournamentPhaseType } from "../Backbone/Config";

interface Prize {
  position: number;
  amount: number;
}

interface Winner {
  nick: string;
  userId: string;
}

interface Properties {
  DisabledEmotes: number[];
  IsInvitationOnly: boolean;
  InvitedIds: string[];
  AdminIds: string[];
  StreamURL: string;
}
interface Phase {
  PhaseType: TournamentPhaseType;
  Maps: string[];
  IsPhase: boolean;
  GroupCount?: number;
  MaxLoses?: number;
  MaxTeams?: number;
  RoundCount: number;
}

export interface ITournament extends Document {
  CurrentInvites: number;
  MaxInvites: number;
  MinPlayersPerMatch: number;
  MaxPlayersPerMatch: number;
  TournamentId: string;
  TournamentName: string;
  TournamentImage?: string;
  TournamentColor?: string;
  StartTime: Date;
  SignupStart: Date;
  EntryFee: number;
  PrizepoolId?: string;
  PartySize: number;
  Status: number;
  TournamentType: number;
  Phases: Phase[];
  Region: string;
  RoundCount: number;
  CurrentPhaseId: number;
  CurrentPhaseStarted?: Date;
  NextPhaseStarted: Date;
  Properties: Properties;
  Prizes?: Prize[];
  Winners?: Winner[];
}

const TournamentSchema = new Schema<ITournament>({
  CurrentInvites: { type: Number, required: true },
  MaxInvites: { type: Number, required: true },
  MinPlayersPerMatch: { type: Number, required: true },
  MaxPlayersPerMatch: { type: Number, required: true },
  TournamentId: { type: String, required: true, unique: true },
  TournamentName: { type: String, required: true },
  TournamentImage: { type: String },
  TournamentColor: { type: String },
  StartTime: { type: Date, required: true },
  SignupStart: { type: Date, required: true },
  EntryFee: { type: Number, required: true },
  PrizepoolId: { type: String, required: false },
  PartySize: { type: Number, required: true },
  Status: { type: Number, required: true },
  TournamentType: { type: Number, required: true },
  Phases: [
    {
      PhaseType: { type: String, required: true },
      Maps: { type: [String], required: true },
      IsPhase: { type: Boolean, required: true },
      GroupCount: { type: Number, required: false },
      MaxLoses: { type: Number, required: false },
      RoundCount: { type: Number, required: true },
      MaxTeams: { type: Number, required: false },
    },
  ],
  Region: { type: String, required: true },
  RoundCount: { type: Number, required: true },
  CurrentPhaseId: { type: Number, required: true },
  CurrentPhaseStarted: { type: Date, default: null },
  NextPhaseStarted: { type: Date, default: null },
  Properties: {
    DisabledEmotes: [{ type: Number, required: false }],
    IsInvitationOnly: { type: Boolean, required: true },
    InvitedIds: [{ type: String, required: false }],
    AdminIds: [{ type: String, required: false }],
    StreamURL: [{ type: String, required: false }],
  },
  Prizes: [
    {
      position: { type: Number, required: true },
      amount: { type: Number, required: true },
    },
  ],
  Winners: [
    {
      nick: { type: String, required: true },
      userId: { type: String, required: true },
    },
  ],
});

/*TournamentSchema.pre("save", function (next) {
  const TotalTeams = this.MaxInvites / this.PartySize;
  let TeamsRemaining = TotalTeams;
  let CalculatedRounds = 0;

  while (TeamsRemaining > 1) {
    CalculatedRounds++;
    TeamsRemaining = Math.ceil(TeamsRemaining / this.MaxPlayersPerMatch) * this.MinPlayersPerMatch;
  }

  this.RoundCount = CalculatedRounds;
  next();
});*/

export type TournamentInput = {
  CurrentInvites: number;
  MaxInvites: number;
  MinPlayersPerMatch: number;
  MaxPlayersPerMatch: number;
  TournamentId: string;
  TournamentName: string;
  TournamentImage?: string;
  TournamentColor?: string;
  StartTime: Date;
  SignupStart: Date;
  EntryFee: number;
  PrizepoolId: string;
  PartySize: number;
  Status: number;
  TournamentType: number;
  Phases: Phase[];
  Region: string;
  RoundCount: number;
  Prizes?: Prize[];
  Winners?: Winner[];
  CurrentPhaseId: number;
  Properties: Properties;
};

export const Tournament = mongoose.model<ITournament>("Tournament", TournamentSchema);
