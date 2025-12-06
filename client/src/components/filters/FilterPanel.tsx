import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sliders, RotateCcw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface FilterConfig {
  minVolume24hUSD: number;
  minRealVolumeRatio?: number; // Optional: minimum real vs fake volume ratio (0.0-1.0)
  maxSpreadPct: number;
  minDepthUSD: number;
  minATRPct: number;
}

// SPRINT 4: Thresholds aligned with project matrix (v1.0)
export const DEFAULT_FILTERS: FilterConfig = {
  minVolume24hUSD: 10_000_000, // $10MM (matrix requirement)
  minRealVolumeRatio: 0.70, // 70% minimum real volume ratio to filter fake volume (matrix requirement)
  maxSpreadPct: 0.005, // 0.5% stored as decimal fraction (matrix requirement)
  minDepthUSD: 200_000, // $200K (matrix requirement)
  minATRPct: 0.01, // 1% stored as percentage point (matrix requirement)
};

interface FilterPanelProps {
  filters: FilterConfig;
  onFiltersChange: (filters: FilterConfig) => void;
  onReset: () => void;
}

export function FilterPanel({ filters, onFiltersChange, onReset }: FilterPanelProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const handleInputChange = (field: keyof FilterConfig, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      onFiltersChange({
        ...filters,
        [field]: numValue,
      });
    }
  };

  const isCustomized = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card data-testid="card-filters">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <Sliders className="h-5 w-5" />
                {t('assets.filters.title')}
              </CardTitle>
              {isCustomized && (
                <Badge variant="secondary" data-testid="badge-custom-filters">
                  {t('assets.filters.customized')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCustomized && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReset}
                  className="gap-1"
                  data-testid="button-reset-filters"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t('assets.filters.reset')}
                </Button>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-toggle-filters">
                  {isOpen ? t('assets.filters.hide') : t('assets.filters.show')}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <CardDescription>
            {t('assets.filters.description')}
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="minVolume" data-testid="label-volume">
                {t('assets.filters.min_volume')}
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">$</span>
                <Input
                  id="minVolume"
                  type="number"
                  min="0"
                  step="1000000"
                  value={filters.minVolume24hUSD}
                  onChange={(e) => handleInputChange('minVolume24hUSD', e.target.value)}
                  data-testid="input-min-volume"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('assets.filters.default')}: $10,000,000
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minRealVolume" data-testid="label-real-volume">
                Min Real Volume Ratio
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="minRealVolume"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={filters.minRealVolumeRatio ?? 0.70}
                  onChange={(e) => handleInputChange('minRealVolumeRatio', e.target.value)}
                  data-testid="input-min-real-volume"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('assets.filters.default')}: 0.70 (70%)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxSpread" data-testid="label-spread">
                {t('assets.filters.max_spread')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="maxSpread"
                  type="number"
                  min="0"
                  max="1"
                  step="0.001"
                  value={filters.maxSpreadPct}
                  onChange={(e) => handleInputChange('maxSpreadPct', e.target.value)}
                  data-testid="input-max-spread"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('assets.filters.default')}: 0.005 (0.5%)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minDepth" data-testid="label-depth">
                {t('assets.filters.min_depth')}
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">$</span>
                <Input
                  id="minDepth"
                  type="number"
                  min="0"
                  step="10000"
                  value={filters.minDepthUSD}
                  onChange={(e) => handleInputChange('minDepthUSD', e.target.value)}
                  data-testid="input-min-depth"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('assets.filters.default')}: $200,000
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minATR" data-testid="label-atr">
                {t('assets.filters.min_atr')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="minATR"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={filters.minATRPct}
                  onChange={(e) => handleInputChange('minATRPct', e.target.value)}
                  data-testid="input-min-atr"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('assets.filters.default')}: 1.0%
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
