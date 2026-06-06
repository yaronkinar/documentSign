/** Gmail +alias addresses that all deliver to the same inbox. */
export const GMAIL_TEST_SIGNERS = [
  { name: 'Yaron Owner', email: 'yaronkinar@gmail.com' },
  { name: 'Yaron Signer 1', email: 'yaronkinar+signer1@gmail.com' },
  { name: 'Yaron Signer 2', email: 'yaronkinar+signer2@gmail.com' },
  { name: 'Yaron Comment Test', email: 'yaronkinar+comment@gmail.com' },
] as const;

export const GMAIL_OWNER_EMAIL = GMAIL_TEST_SIGNERS[0].email;
