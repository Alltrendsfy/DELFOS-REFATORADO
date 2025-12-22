import type { IStorage } from '../storage';
import { externalServiceToggleService } from './externalServiceToggleService';

interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
}

interface TwitterUser {
  id: string;
  name: string;
  username: string;
}

interface TwitterSearchResponse {
  data?: Tweet[];
  includes?: {
    users?: TwitterUser[];
  };
  meta?: {
    result_count: number;
  };
}

export class TwitterService {
  private bearerToken: string | undefined;
  private baseUrl = 'https://api.twitter.com/2';

  constructor(private storage: IStorage) {
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!this.bearerToken) {
      console.warn('TWITTER_BEARER_TOKEN not configured - news feed will not fetch new tweets');
    }
  }

  /**
   * Fetch recent crypto-related tweets from influential accounts and hashtags
   */
  async fetchCryptoNews(maxResults: number = 20): Promise<void> {
    // Check if service is enabled
    const isEnabled = await externalServiceToggleService.isServiceEnabled('twitter');
    if (!isEnabled) {
      console.log('[Twitter] Service is disabled by admin toggle');
      throw new Error('Feed de notícias do Twitter está temporariamente desativado.');
    }

    if (!this.bearerToken) {
      throw new Error('Twitter API credentials not configured. Please set TWITTER_BEARER_TOKEN environment variable.');
    }
    
    try {
      // Search query for crypto-related content
      // Using simple keywords compatible with Twitter API v2 free tier
      const query = '(bitcoin OR BTC OR ethereum OR ETH OR crypto) -is:retweet lang:en';

      const url = new URL(`${this.baseUrl}/tweets/search/recent`);
      url.searchParams.set('query', query);
      url.searchParams.set('max_results', Math.min(maxResults, 100).toString());
      url.searchParams.set('tweet.fields', 'created_at,author_id,public_metrics');
      url.searchParams.set('expansions', 'author_id');
      url.searchParams.set('user.fields', 'name,username,verified');
      // Note: sort_order='relevancy' requires paid tier, so we use default recency ordering

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
          'User-Agent': 'DELFOS-Trading-Platform/1.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Twitter API error:', response.status, response.statusText);
        console.error('Twitter API error details:', errorText);
        throw new Error(`Twitter API error: ${response.status} - ${errorText || response.statusText}`);
      }

      const data: TwitterSearchResponse = await response.json();

      if (!data.data || data.data.length === 0) {
        console.log('No new tweets found');
        return;
      }

      // Create a map of users for quick lookup
      const userMap = new Map<string, TwitterUser>();
      if (data.includes?.users) {
        data.includes.users.forEach(user => {
          userMap.set(user.id, user);
        });
      }

      // Store tweets in database
      const newsItems = data.data.map(tweet => {
        const author = userMap.get(tweet.author_id);
        return {
          tweet_id: tweet.id,
          author: author?.name || 'Unknown',
          author_username: author?.username || 'unknown',
          content: tweet.text,
          url: `https://twitter.com/${author?.username || 'i'}/status/${tweet.id}`,
          created_at: new Date(tweet.created_at),
        };
      });

      // Save to database (avoiding duplicates via unique tweet_id constraint)
      for (const item of newsItems) {
        try {
          await this.storage.createNewsFeedItem(item);
        } catch (error: any) {
          // Ignore duplicate key errors (tweet already exists)
          if (!error.message?.includes('duplicate') && !error.message?.includes('unique')) {
            console.error('Error saving news item:', error);
          }
        }
      }

      console.log(`✓ Fetched and stored ${newsItems.length} crypto news tweets`);
    } catch (error) {
      console.error('Error fetching crypto news from Twitter:', error);
      throw error;
    }
  }

  /**
   * Get stored news feed items
   */
  async getNewsFeed(limit: number = 50) {
    return await this.storage.getNewsFeed(limit);
  }

  /**
   * Delete old news items (older than 7 days)
   * Currently not used - could be added to scheduled tasks
   */
  async cleanupOldNews(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // TODO: Add deleteOldNewsFeed method to storage interface if needed
    console.log('✓ News cleanup not yet implemented');
  }
}
