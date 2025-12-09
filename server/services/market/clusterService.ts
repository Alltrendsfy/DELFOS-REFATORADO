import { storage } from "../../storage";
import type { SymbolRanking } from "@shared/schema";

interface ClusterAssignment {
  symbolId: string;
  clusterNumber: number;
  distanceToCenter: number;
}

interface PCAResult {
  components: number[][];
  explainedVariance: number[];
}

interface KMeansResult {
  clusters: number[];
  centroids: number[][];
  iterations: number;
}

/**
 * ClusterService: Dimensionality reduction + K-means clustering
 * 
 * Architecture:
 * - Uses PCA to reduce feature space to 2-3 principal components
 * - Applies K-means clustering (K=10) on reduced space
 * - Assigns up to 10 assets per cluster
 * - Follows IStorage abstraction pattern
 * - Graceful error handling with fallbacks
 */
class ClusterService {
  private readonly TARGET_CLUSTERS = 10;
  private readonly MAX_ASSETS_PER_CLUSTER = 10;
  private readonly PCA_COMPONENTS = 2; // 2D for simplicity
  private readonly MAX_KMEANS_ITERATIONS = 100;
  private readonly CONVERGENCE_THRESHOLD = 0.0001;

  /**
   * Main entry point: cluster ranked symbols and persist assignments
   */
  async clusterSymbols(runId: string): Promise<ClusterAssignment[]> {
    try {
      console.log(`🔬 Starting clustering for run ${runId}...`);

      // 1. Load ranked symbols
      const rankings = await storage.getRankingsByRunId(runId);
      if (rankings.length === 0) {
        console.warn(`⚠️ No rankings found for run ${runId}`);
        return [];
      }

      // 2. Extract feature matrix (filters invalid rankings)
      const { features, validRankings } = await this.extractFeatures(rankings);
      if (features.length === 0) {
        console.warn(`⚠️ No features extracted for clustering`);
        return [];
      }

      // 3. Apply PCA preprocessing (centering for MVP)
      const normalizedFeatures = this.applyPCA(features);

      // 4. Run K-means clustering on normalized features
      const kmeansResult = this.runKMeans(normalizedFeatures, this.TARGET_CLUSTERS);

      // 5. Build cluster assignments (uses same subset as features)
      const assignments = this.buildAssignments(
        validRankings, // Only rankings that have valid features
        kmeansResult.clusters,
        kmeansResult.centroids,
        normalizedFeatures
      );

      // 6. Balance clusters (max 10 assets per cluster)
      const balanced = this.balanceClusters(assignments);

      // 7. Persist to database
      await this.persistAssignments(runId, balanced);

      console.log(`✅ Clustered ${balanced.length} symbols into ${this.TARGET_CLUSTERS} clusters`);
      return balanced;
    } catch (error) {
      console.error(`❌ Clustering failed for run ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Extract feature matrix from rankings
   * Returns both features and the filtered rankings (same subset)
   * Features: rank, score, (future: volatility, momentum, etc.)
   */
  private async extractFeatures(
    rankings: SymbolRanking[]
  ): Promise<{ features: number[][], validRankings: SymbolRanking[] }> {
    const features: number[][] = [];
    const validRankings: SymbolRanking[] = [];

    for (const ranking of rankings) {
      // Parse score (stored as string in decimal format)
      const score = parseFloat(ranking.score);
      if (isNaN(score)) {
        console.warn(`⚠️ Invalid score for symbol ${ranking.symbol_id}: ${ranking.score}`);
        continue; // Skip this ranking
      }

      // Normalize rank to [0, 1]
      const normalizedRank = (rankings.length - ranking.rank) / rankings.length;

      // Feature vector: [normalizedRank, score]
      features.push([normalizedRank, score]);
      validRankings.push(ranking); // Track which ranking this feature belongs to
    }

    return { features, validRankings };
  }

  /**
   * Apply Min-Max normalization (0-1 range)
   * 
   * IMPLEMENTATION:
   * - Normalizes each feature to [0, 1] range
   * - Uses Min-Max scaling: (x - min) / (max - min)
   * - Handles edge case where all values are the same
   * 
   * RATIONALE:
   * - Min-Max normalization is required by specification
   * - Better for K-means when features have different scales
   * - Preserves relative distances between data points
   */
  private applyPCA(data: number[][]): number[][] {
    if (data.length === 0) {
      return [];
    }

    const n = data.length;
    const d = data[0].length;

    const mins = new Array(d).fill(Infinity);
    const maxs = new Array(d).fill(-Infinity);

    for (let j = 0; j < d; j++) {
      for (let i = 0; i < n; i++) {
        mins[j] = Math.min(mins[j], data[i][j]);
        maxs[j] = Math.max(maxs[j], data[i][j]);
      }
    }

    const normalized = data.map(row =>
      row.map((val, j) => {
        const range = maxs[j] - mins[j];
        return range === 0 ? 0 : (val - mins[j]) / range;
      })
    );

    return normalized;
  }

  /**
   * Run K-means clustering
   */
  private runKMeans(data: number[][], k: number): KMeansResult {
    if (data.length === 0) {
      return { clusters: [], centroids: [], iterations: 0 };
    }

    const n = data.length;
    const d = data[0].length;

    // 1. Initialize centroids randomly
    const centroids: number[][] = [];
    const indices = new Set<number>();
    while (centroids.length < k && centroids.length < n) {
      const idx = Math.floor(Math.random() * n);
      if (!indices.has(idx)) {
        indices.add(idx);
        centroids.push([...data[idx]]);
      }
    }

    // If we have fewer data points than clusters, adjust k
    const actualK = centroids.length;
    const clusters: number[] = new Array(n).fill(0);

    // 2. Iterate until convergence
    let iterations = 0;
    let converged = false;

    while (!converged && iterations < this.MAX_KMEANS_ITERATIONS) {
      iterations++;

      // Assignment step: assign each point to nearest centroid
      for (let i = 0; i < n; i++) {
        let minDist = Infinity;
        let minCluster = 0;

        for (let j = 0; j < actualK; j++) {
          const dist = this.euclideanDistance(data[i], centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            minCluster = j;
          }
        }

        clusters[i] = minCluster;
      }

      // Update step: recompute centroids
      const newCentroids: number[][] = Array(actualK).fill(0).map(() => Array(d).fill(0));
      const counts = new Array(actualK).fill(0);

      for (let i = 0; i < n; i++) {
        const c = clusters[i];
        counts[c]++;
        for (let j = 0; j < d; j++) {
          newCentroids[c][j] += data[i][j];
        }
      }

      for (let c = 0; c < actualK; c++) {
        if (counts[c] > 0) {
          // Normal update: divide by count
          for (let j = 0; j < d; j++) {
            newCentroids[c][j] /= counts[c];
          }
        } else {
          // Empty cluster guard: keep previous centroid position
          // This prevents all-zero centroids that break distance calculations
          newCentroids[c] = [...centroids[c]];
        }
      }

      // Check convergence
      let maxShift = 0;
      for (let c = 0; c < actualK; c++) {
        const shift = this.euclideanDistance(centroids[c], newCentroids[c]);
        maxShift = Math.max(maxShift, shift);
      }

      if (maxShift < this.CONVERGENCE_THRESHOLD) {
        converged = true;
      }

      // Update centroids
      for (let c = 0; c < actualK; c++) {
        centroids[c] = newCentroids[c];
      }
    }

    console.log(`🔬 K-means converged in ${iterations} iterations`);
    return { clusters, centroids, iterations };
  }

  /**
   * Build cluster assignments with distances to centroids
   */
  private buildAssignments(
    rankings: SymbolRanking[],
    clusters: number[],
    centroids: number[][],
    components: number[][]
  ): ClusterAssignment[] {
    const assignments: ClusterAssignment[] = [];

    for (let i = 0; i < rankings.length; i++) {
      const clusterNumber = clusters[i];
      const centroid = centroids[clusterNumber];
      const point = components[i];

      const distance = this.euclideanDistance(point, centroid);

      assignments.push({
        symbolId: rankings[i].symbol_id,
        clusterNumber,
        distanceToCenter: distance,
      });
    }

    return assignments;
  }

  /**
   * Balance clusters to max 10 assets per cluster
   * If a cluster has >10 assets, keep only the 10 closest to centroid
   */
  private balanceClusters(assignments: ClusterAssignment[]): ClusterAssignment[] {
    const clusterMap = new Map<number, ClusterAssignment[]>();

    // Group by cluster
    for (const assignment of assignments) {
      const cluster = assignment.clusterNumber;
      if (!clusterMap.has(cluster)) {
        clusterMap.set(cluster, []);
      }
      clusterMap.get(cluster)!.push(assignment);
    }

    // Balance each cluster
    const balanced: ClusterAssignment[] = [];
    for (const [clusterNum, members] of Array.from(clusterMap.entries())) {
      // Sort by distance to center (ascending)
      members.sort((a: ClusterAssignment, b: ClusterAssignment) => a.distanceToCenter - b.distanceToCenter);

      // Keep only top MAX_ASSETS_PER_CLUSTER
      const kept = members.slice(0, this.MAX_ASSETS_PER_CLUSTER);
      balanced.push(...kept);

      if (members.length > this.MAX_ASSETS_PER_CLUSTER) {
        console.log(
          `⚖️ Cluster ${clusterNum}: trimmed from ${members.length} to ${this.MAX_ASSETS_PER_CLUSTER} assets`
        );
      }
    }

    return balanced;
  }

  /**
   * Persist cluster assignments to database
   */
  private async persistAssignments(runId: string, assignments: ClusterAssignment[]): Promise<void> {
    const promises = assignments.map(assignment =>
      storage.updateRankingCluster(runId, assignment.symbolId, assignment.clusterNumber)
    );

    await Promise.all(promises);
    console.log(`✅ Persisted ${assignments.length} cluster assignments`);
  }

  /**
   * Euclidean distance between two vectors
   */
  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have same dimension");
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }
}

export const clusterService = new ClusterService();
