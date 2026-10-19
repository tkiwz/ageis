import type { Messages } from "../en";
import { coreNs } from "./core";
import { dashboardNs } from "./dashboard";
import { enums } from "./enums";
import { ops } from "./ops";
import { assets } from "./assets";
import { command } from "./command";
import { safety } from "./safety";
import { mobile } from "./mobile";
import { voice } from "./voice";
import { intel } from "./intel";
import { governance } from "./governance";
import { admin } from "./admin";

export const ar: Messages = { ...coreNs, ...dashboardNs, enums, ops, assets, command, safety, mobile, voice, intel, governance, admin };
