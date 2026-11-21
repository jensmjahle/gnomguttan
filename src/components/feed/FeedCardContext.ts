import { createContext, useContext } from 'react';

interface FeedCardOptions {
  /** Show every comment instead of the latest two (used on a post's own page). */
  expandComments: boolean;
  /** Comment or reply to scroll to and highlight, from a #c-<id> link. */
  highlightCommentId?: string;
}

const FeedCardContext = createContext<FeedCardOptions>({ expandComments: false });

export const FeedCardOptionsProvider = FeedCardContext.Provider;

export function useFeedCardOptions() {
  return useContext(FeedCardContext);
}
