//* Parses the optional `user` option off a slash-command interaction, so both
//* ticket commands can answer about someone other than the caller.

export type InteractionData = {
  name: string;
  options?: Array<{ name: string; type: number; value: unknown }>;
  resolved?: { users?: Record<string, { username: string; global_name?: string | null }> };
};

export type CommandTarget = { discordUserId: string; displayName: string };

//! No `user` option means the caller asked about themselves — the original
//! behaviour of both commands, and what a bare /tickets-list still does.
export function parseCommandTarget(data: InteractionData | undefined): CommandTarget | null {
  const option = data?.options?.find((o) => o.name === "user");
  if (!option || typeof option.value !== "string" || option.value === "") return null;

  const resolved = data?.resolved?.users?.[option.value];
  //! Display name, never a `<@id>` mention — a mention in the reply renders as
  //! a ping, and the nickname is what the picker showed the caller anyway.
  return {
    discordUserId: option.value,
    displayName: resolved?.global_name || resolved?.username || "That user",
  };
}
