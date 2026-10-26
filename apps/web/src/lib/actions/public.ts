"use server";
import { apiAction, formBody } from "@/lib/api";
import type { ActionState } from "./types";

export async function sendContact(_: ActionState, form: FormData): Promise<ActionState> {
  return apiAction("/public/contact", { body: formBody(form) });
}
