import { Schema, type } from "@colyseus/schema";

export class BetSchema extends Schema {
  @type("string") bettorSessionId: string = "";
  @type("string") bettorWallet: string = "";
  @type("string") marketType: string = ""; // "next_kill" | "next_death" | "winner" | "most_deaths"
  @type("string") targetPlayerId: string = ""; // who they're betting ON
  @type("uint32") amountMicro: number = 0; // display amount (6-dec USDC)
}
