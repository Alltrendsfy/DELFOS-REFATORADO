import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { MarketDataCache } from "@shared/schema";

interface PositionFormData {
  symbol: string;
  side: string;
  quantity: string;
  stopLoss: string;
  takeProfit: string;
}

interface PositionFormProps {
  formData: PositionFormData;
  symbols: MarketDataCache[] | undefined;
  isPending: boolean;
  onFormChange: (data: Partial<PositionFormData>) => void;
  onSubmit: () => void;
  translations: {
    openPosition: string;
    selectSymbol: string;
    side: string;
    long: string;
    short: string;
    quantity: string;
    stopLoss: string;
    takeProfit: string;
    enterQuantity: string;
    enterPrice: string;
    loading: string;
  };
}

export function PositionForm({
  formData,
  symbols,
  isPending,
  onFormChange,
  onSubmit,
  translations: t,
}: PositionFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.openPosition}</CardTitle>
        <CardDescription>{t.selectSymbol}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="position-symbol-select" data-testid="label-position-symbol">
            {t.selectSymbol}
          </Label>
          <Select
            value={formData.symbol}
            onValueChange={(v) => onFormChange({ symbol: v })}
          >
            <SelectTrigger id="position-symbol-select" data-testid="select-position-symbol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {symbols?.map((s) => (
                <SelectItem
                  key={s.symbol}
                  value={s.symbol}
                  data-testid={`option-position-symbol-${s.symbol}`}
                >
                  {s.symbol} - ${parseFloat(s.current_price).toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="position-side-select" data-testid="label-position-side">
            {t.side}
          </Label>
          <Select
            value={formData.side}
            onValueChange={(v) => onFormChange({ side: v })}
          >
            <SelectTrigger id="position-side-select" data-testid="select-position-side">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long" data-testid="option-side-long">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  {t.long.toUpperCase()}
                </div>
              </SelectItem>
              <SelectItem value="short" data-testid="option-side-short">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  {t.short.toUpperCase()}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="position-quantity-input" data-testid="label-position-quantity">
            {t.quantity}
          </Label>
          <Input
            id="position-quantity-input"
            data-testid="input-position-quantity"
            type="number"
            step="0.00000001"
            placeholder={t.enterQuantity}
            value={formData.quantity}
            onChange={(e) => onFormChange({ quantity: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="position-stop-loss-input" data-testid="label-position-stop-loss">
            {t.stopLoss} ({t.enterPrice.toLowerCase()})
          </Label>
          <Input
            id="position-stop-loss-input"
            data-testid="input-position-stop-loss"
            type="number"
            step="0.01"
            placeholder={`${t.stopLoss} (optional)`}
            value={formData.stopLoss}
            onChange={(e) => onFormChange({ stopLoss: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="position-take-profit-input" data-testid="label-position-take-profit">
            {t.takeProfit} ({t.enterPrice.toLowerCase()})
          </Label>
          <Input
            id="position-take-profit-input"
            data-testid="input-position-take-profit"
            type="number"
            step="0.01"
            placeholder={`${t.takeProfit} (optional)`}
            value={formData.takeProfit}
            onChange={(e) => onFormChange({ takeProfit: e.target.value })}
          />
        </div>

        <Button
          data-testid="button-open-position"
          className="w-full"
          onClick={onSubmit}
          disabled={!formData.symbol || !formData.quantity || isPending}
        >
          {isPending ? t.loading : t.openPosition}
        </Button>
      </CardContent>
    </Card>
  );
}
