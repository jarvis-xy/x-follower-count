// Synthetic API payloads shaped like X's real responses (structure verified
// against x.com on 2026-10-09; handles and numbers are made up).

const user2026 = (screen_name, name, followers, following) => ({
  __typename: 'User',
  id: 'VXNlcjo' + screen_name,
  rest_id: String(screen_name.length * 1000),
  core: { created_at: 'Mon Jan 01 00:00:00 +0000 2020', name, screen_name },
  relationship_counts: { followers, following },
  is_blue_verified: true,
  verification: { verified: false },
  privacy: { protected: false },
  avatar: { image_url: 'https://pbs.twimg.com/profile_images/x.jpg' },
});

const userLegacy = (screen_name, name, followers, following) => ({
  __typename: 'User',
  id: 'VXNlcjo' + screen_name,
  rest_id: String(screen_name.length * 1000),
  core: { created_at: 'Mon Jan 01 00:00:00 +0000 2020', name, screen_name },
  legacy: { followers_count: followers, friends_count: following, description: 'bio' },
  is_blue_verified: true,
});

const tweet = (id, user, extra = {}) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: user } },
  legacy: { full_text: 'hello ' + id, favorite_count: 3, retweet_count: 1 },
  ...extra,
});

export const USERS = {
  alice_ai: { name: 'Alice', f: 174123, g: 512 },
  bob_builds: { name: 'Bob Builder', f: 11000, g: 90 },
  carol_dev: { name: 'Carol', f: 1574, g: 300 },
  dan_quotes: { name: 'Dan', f: 164000, g: 10 },
  erin_cn: { name: '沐阳', f: 35000, g: 800 },
  frank_7: { name: 'aLittleBit', f: 7, g: 40 },
  grace_lynne: { name: 'Lynne早睡', f: 7806, g: 1200 },
};

// HomeTimeline, 2026 shape: relationship_counts + core.screen_name, no legacy on users.
export function homeTimeline2026() {
  const u = (h) => user2026(h, USERS[h].name, USERS[h].f, USERS[h].g);
  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                { entryId: 'tweet-1', content: { itemContent: { tweet_results: { result: tweet('1', u('alice_ai')) } } } },
                { entryId: 'tweet-2', content: { itemContent: { tweet_results: { result: tweet('2', u('bob_builds')) } } } },
                {
                  entryId: 'tweet-3',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: tweet('3', u('carol_dev'), {
                          quoted_status_result: { result: tweet('4', u('dan_quotes')) },
                        }),
                      },
                    },
                  },
                },
                // noise that must not be mistaken for users
                { entryId: 'cursor-bottom', content: { value: 'abc', cursorType: 'Bottom' } },
                { entryId: 'gone', content: { itemContent: { user_results: { result: { __typename: 'UserUnavailable', reason: 'Suspended' } } } } },
              ],
            },
          ],
        },
      },
    },
  };
}

// Followers timeline in the older shape (legacy.followers_count) — kept so the
// extension survives X rolling the schema back or serving mixed shapes.
export function followersLegacy() {
  const u = (h) => userLegacy(h, USERS[h].name, USERS[h].f, USERS[h].g);
  return {
    data: {
      user: {
        result: {
          timeline: {
            timeline: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: ['erin_cn', 'frank_7', 'grace_lynne'].map((h) => ({
                    entryId: 'user-' + h,
                    content: { itemContent: { user_results: { result: u(h) } } },
                  })),
                },
              ],
            },
          },
        },
      },
    },
  };
}

// REST v1.1 style user object.
export function restUser() {
  return { id_str: '42', screen_name: 'rest_user', name: 'Rest', followers_count: 123456789, friends_count: 5 };
}
