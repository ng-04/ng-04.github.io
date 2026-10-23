// Firebase web config. These values are public by design: anyone can see them in the
// page source. What protects the data is database.rules.json (only the leader can write).
// Paste the config from Firebase console → Project settings → Your apps → Web app.
export const FIREBASE_CONFIG = {
  apiKey: 'REPLACE_ME',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  appId: '',
};

// The one Firebase Auth user who can move the pointer. Its password is the leader PIN,
// which is never stored here. The address only needs to look like an email; no mail is sent.
// For a co-leader with their own PIN, make this a list: ['leader@…', 'coleader@…'].
export const ADMIN_EMAIL = 'leader@sunderkand-path.com';

// Number of verses in verses.json. database.rules.json allows idx 0 to TOTAL - 1.
export const TOTAL = 660;
