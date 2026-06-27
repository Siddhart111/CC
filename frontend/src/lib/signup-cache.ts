// Tiny in-memory cache to carry signup state between Signup → OTP screens.
// Password never goes into router params or storage.
type Pending = { email: string; password: string; college_id: string } | null;
let pending: Pending = null;

export const signupCache = {
  set(v: NonNullable<Pending>) {
    pending = v;
  },
  get(): Pending {
    return pending;
  },
  clear() {
    pending = null;
  },
};
