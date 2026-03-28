export type InstagramAccountLike = {
  id: string;
  username?: string | null;
};

export function filterDisplayableInstagramAccounts<T extends InstagramAccountLike>(accounts: T[]): T[] {
  const normalized = accounts.filter((account) => account?.id);
  const hasUsernameBackedAccount = normalized.some(
    (account) => typeof account.username === "string" && account.username.trim().length > 0,
  );

  // Hide page-backed IG entries (typically no username) when a real IG account exists.
  if (hasUsernameBackedAccount) {
    return normalized.filter(
      (account) => typeof account.username === "string" && account.username.trim().length > 0,
    );
  }

  return normalized;
}
