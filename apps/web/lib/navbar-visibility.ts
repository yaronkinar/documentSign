export function shouldHideNavbar(pathname: string) {
  return (
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/sign/') ||
    pathname.startsWith('/onboarding')
  );
}
