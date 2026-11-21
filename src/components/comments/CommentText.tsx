import { Fragment } from 'react';
import { useAuthStore } from '@/store/authStore';
import { splitMentions } from '@/utils/comments';
import { UserLink } from '@/components/profile/UserLink';
import type { CommentMention } from '@/types';
import styles from './CommentText.module.css';

interface Props {
  text: string;
  mentions?: CommentMention[];
}

/** Comment or post text with @mentions highlighted (mentions of you stand out more). */
export function CommentText({ text, mentions }: Props) {
  const myUid = useAuthStore((s) => s.user?.uid ?? null);

  return (
    <>
      {splitMentions(text, mentions).map((segment, index) =>
        segment.mention ? (
          <UserLink
            key={index}
            uid={segment.mention.uid}
            name={segment.mention.name}
            className={`${styles.mention} ${segment.mention.uid === myUid ? styles.mentionSelf : ''}`}
          >
            {segment.text}
          </UserLink>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </>
  );
}
