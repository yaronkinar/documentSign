import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SignUpSsoCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}
