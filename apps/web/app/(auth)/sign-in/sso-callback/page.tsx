import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SignInSsoCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
