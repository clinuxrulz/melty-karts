export function makeInviteCode(): string {
  const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export async function inviteCodeToId(inviteCode: string, type: "peer" | "room"): Promise<string> {
  const salt = `melty-karts-${type}-7ae48d46-10f2-`;
  const msgUint8 = new TextEncoder().encode(salt + inviteCode);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  // Return a portion of the hash to keep it reasonably short but unique
  return hashHex.slice(0, 32);
}
