import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';
import type { NewsFeed } from '@shared/schema';

export default function News() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: newsItems = [], isLoading } = useQuery<NewsFeed[]>({
    queryKey: ['/api/news'],
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/news/refresh", "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/news'] });
      toast({
        title: "News refreshed",
        description: "Latest crypto news has been fetched from Twitter/X",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-news">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            {t("nav.news")}
          </h1>
          <p className="text-muted-foreground mt-1">
            Latest crypto news and updates from Twitter/X
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          data-testid="button-refresh-news"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Feed'}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-1/3"></div>
                <div className="h-3 bg-muted rounded w-1/4 mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-5/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : newsItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No news available yet</p>
            <Button onClick={handleRefresh} disabled={refreshMutation.isPending}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Fetch News
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {newsItems.map((item) => (
            <Card
              key={item.id}
              className="hover-elevate transition-all duration-200"
              data-testid={`card-news-${item.tweet_id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-base font-semibold" data-testid={`text-author-${item.tweet_id}`}>
                      {item.author}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <span data-testid={`text-username-${item.tweet_id}`}>@{item.author_username}</span>
                      <span className="text-xs">•</span>
                      <span className="flex items-center gap-1 text-xs">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </CardDescription>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors"
                    data-testid={`link-tweet-${item.tweet_id}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  data-testid={`text-content-${item.tweet_id}`}
                >
                  {item.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {newsItems.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {newsItems.length} news items
        </div>
      )}
    </div>
  );
}
