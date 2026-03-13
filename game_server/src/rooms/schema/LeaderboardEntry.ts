import { Schema, type } from "@colyseus/schema";

export class LeaderboardEntry extends Schema {
  @type("string") playerId: string = "";
  @type("string") name: string = "";
  @type("uint16") kills: number = 0;
  @type("uint16") deaths: number = 0;
  @type("int32") score: number = 0;
  @type("uint32") payoutMicro: number = 0; // final payout in display units
}
