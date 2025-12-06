import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import type { Portfolio, MarketDataCache } from "@shared/schema";

interface OrderFormData {
  symbol: string;
  side: string;
  type: string;
  quantity: string;
  price: string;
  stopPrice: string;
}

interface OrderFormProps {
  selectedPortfolio: string;
  formData: OrderFormData;
  portfolios: Portfolio[] | undefined;
  symbols: MarketDataCache[] | undefined;
  isPending: boolean;
  onPortfolioChange: (portfolioId: string) => void;
  onFormChange: (data: Partial<OrderFormData>) => void;
  onSubmit: () => void;
  translations: {
    placeOrder: string;
    selectPortfolio: string;
    selectSymbol: string;
    side: string;
    buy: string;
    sell: string;
    orderType: string;
    market: string;
    limit: string;
    stopLoss: string;
    takeProfit: string;
    quantity: string;
    price: string;
    stopPrice: string;
    enterQuantity: string;
    enterPrice: string;
    executeOrder: string;
    loading: string;
  };
}

export function OrderForm({
  selectedPortfolio,
  formData,
  portfolios,
  symbols,
  isPending,
  onPortfolioChange,
  onFormChange,
  onSubmit,
  translations: t,
}: OrderFormProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle>{t.placeOrder}</CardTitle>
        <CardDescription>{t.selectPortfolio}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="portfolio-select" data-testid="label-portfolio">
            {t.selectPortfolio}
          </Label>
          <Select value={selectedPortfolio} onValueChange={onPortfolioChange}>
            <SelectTrigger id="portfolio-select" data-testid="select-portfolio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {portfolios?.map((p) => (
                <SelectItem key={p.id} value={p.id} data-testid={`option-portfolio-${p.id}`}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedPortfolio && (
          <>
            <div className="space-y-2">
              <Label htmlFor="symbol-select" data-testid="label-symbol">
                {t.selectSymbol}
              </Label>
              <Select
                value={formData.symbol}
                onValueChange={(v) => onFormChange({ symbol: v })}
              >
                <SelectTrigger id="symbol-select" data-testid="select-symbol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {symbols?.map((s) => (
                    <SelectItem
                      key={s.symbol}
                      value={s.symbol}
                      data-testid={`option-symbol-${s.symbol}`}
                    >
                      {s.symbol} - ${parseFloat(s.current_price).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="side-select" data-testid="label-side">
                {t.side}
              </Label>
              <Select
                value={formData.side}
                onValueChange={(v) => onFormChange({ side: v })}
              >
                <SelectTrigger id="side-select" data-testid="select-side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy" data-testid="option-side-buy">
                    <div className="flex items-center gap-2">
                      <ArrowUpCircle className="w-4 h-4 text-green-500" />
                      {t.buy}
                    </div>
                  </SelectItem>
                  <SelectItem value="sell" data-testid="option-side-sell">
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle className="w-4 h-4 text-red-500" />
                      {t.sell}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type-select" data-testid="label-type">
                {t.orderType}
              </Label>
              <Select
                value={formData.type}
                onValueChange={(v) => onFormChange({ type: v })}
              >
                <SelectTrigger id="type-select" data-testid="select-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market" data-testid="option-type-market">
                    {t.market}
                  </SelectItem>
                  <SelectItem value="limit" data-testid="option-type-limit">
                    {t.limit}
                  </SelectItem>
                  <SelectItem value="stop_loss" data-testid="option-type-stop-loss">
                    {t.stopLoss}
                  </SelectItem>
                  <SelectItem value="take_profit" data-testid="option-type-take-profit">
                    {t.takeProfit}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity-input" data-testid="label-quantity">
                {t.quantity}
              </Label>
              <Input
                id="quantity-input"
                data-testid="input-quantity"
                type="number"
                step="0.00000001"
                placeholder={t.enterQuantity}
                value={formData.quantity}
                onChange={(e) => onFormChange({ quantity: e.target.value })}
              />
            </div>

            {formData.type === "limit" && (
              <div className="space-y-2">
                <Label htmlFor="price-input" data-testid="label-price">
                  {t.price}
                </Label>
                <Input
                  id="price-input"
                  data-testid="input-price"
                  type="number"
                  step="0.01"
                  placeholder={t.enterPrice}
                  value={formData.price}
                  onChange={(e) => onFormChange({ price: e.target.value })}
                />
              </div>
            )}

            {(formData.type === "stop_loss" || formData.type === "take_profit") && (
              <div className="space-y-2">
                <Label htmlFor="stop-price-input" data-testid="label-stop-price">
                  {t.stopPrice}
                </Label>
                <Input
                  id="stop-price-input"
                  data-testid="input-stop-price"
                  type="number"
                  step="0.01"
                  placeholder={t.enterPrice}
                  value={formData.stopPrice}
                  onChange={(e) => onFormChange({ stopPrice: e.target.value })}
                />
              </div>
            )}

            <Button
              data-testid="button-execute-order"
              className="w-full"
              onClick={onSubmit}
              disabled={!formData.symbol || !formData.quantity || isPending}
            >
              {isPending ? t.loading : t.executeOrder}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
