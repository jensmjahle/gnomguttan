import { KeyboardAvoidingView, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { qk } from '@/data/queryClient';
import { loadFeedItem } from '@/services/feed';
import { errorText } from '@/services/appApi';
import { getFeedItemThread } from '@/utils/comments.generated';
import { FeedCard } from '@/components/feed/FeedCard';
import { CommentSection } from '@/components/comments/CommentSection';
import { Card, ErrorBox, Loading, Screen, T } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FeedPost'>;

/** One post with all its comments (the website's /innlegg/:id). */
export function FeedPostScreen({ route }: Props) {
  const { feedItemId, commentId } = route.params;
  const { data: item, error, isLoading, refetch, isRefetching } = useQuery({ queryKey: qk.feedItem(feedItemId), queryFn: () => loadFeedItem(feedItemId) });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
        {isLoading && !item ? <Loading /> : null}
        {error && !item ? <ErrorBox message={errorText(error, 'Fant ikke innlegget.')} onRetry={() => void refetch()} /> : null}
        {item ? (
          <>
            <FeedCard item={item} standalone />
            <Card>
              <T weight={700}>Kommentarer</T>
              <CommentSection thread={getFeedItemThread(item)} comments={item.comments ?? []} highlightId={commentId} />
            </Card>
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
