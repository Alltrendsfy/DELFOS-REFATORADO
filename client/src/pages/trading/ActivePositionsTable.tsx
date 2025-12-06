import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TrendingUp, TrendingDown, X } from "lucide-react";
import { useState } from "react";
import type { Position } from "@shared/schema";

interface ActivePositionsTableProps {
  positions: Position[];
  onClosePosition: (positionId: string) => void;
  isClosing: boolean;
  tradingMode?: "paper" | "live";
  translations: {
    symbol: string;
    side: string;
    long: string;
    short: string;
    qty: string;
    entryPrice: string;
    currentPrice: string;
    unrealizedPnL: string;
    actions: string;
    closePosition: string;
    noPositions: string;
    confirmClose: string;
    confirmCloseMessage: string;
    confirmCloseLiveTitle: string;
    confirmCloseLiveMessage: string;
    cancel: string;
  };
}

export function ActivePositionsTable({
  positions,
  onClosePosition,
  isClosing,
  tradingMode,
  translations: t,
}: ActivePositionsTableProps) {
  const [positionToClose, setPositionToClose] = useState<string | null>(null);

  const handleCloseConfirm = () => {
    if (positionToClose) {
      onClosePosition(positionToClose);
      setPositionToClose(null);
    }
  };

  if (positions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="text-no-positions">
        {t.noPositions}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="table-active-positions">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">{t.symbol}</th>
              <th className="text-left p-3 font-medium">{t.side}</th>
              <th className="text-right p-3 font-medium">{t.qty}</th>
              <th className="text-right p-3 font-medium">{t.entryPrice}</th>
              <th className="text-right p-3 font-medium">{t.currentPrice}</th>
              <th className="text-right p-3 font-medium">{t.unrealizedPnL}</th>
              <th className="text-center p-3 font-medium">{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const isLong = position.side === "long";
              const pnlValue = parseFloat(position.unrealized_pnl);
              const pnlPct = parseFloat(position.unrealized_pnl_percentage);
              const isProfitable = pnlValue >= 0;

              return (
                <tr
                  key={position.id}
                  className="border-b hover-elevate"
                  data-testid={`row-position-${position.id}`}
                >
                  <td className="p-3 font-medium" data-testid={`text-symbol-${position.id}`}>
                    {position.symbol}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {isLong ? (
                        <>
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <span className="text-green-500 font-medium" data-testid={`text-side-${position.id}`}>
                            {t.long.toUpperCase()}
                          </span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-4 h-4 text-red-500" />
                          <span className="text-red-500 font-medium" data-testid={`text-side-${position.id}`}>
                            {t.short.toUpperCase()}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono" data-testid={`text-quantity-${position.id}`}>
                    {parseFloat(position.quantity).toFixed(8)}
                  </td>
                  <td className="p-3 text-right font-mono" data-testid={`text-entry-${position.id}`}>
                    ${parseFloat(position.entry_price).toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono" data-testid={`text-current-${position.id}`}>
                    ${parseFloat(position.current_price).toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex flex-col items-end">
                      <span
                        className={`font-mono font-medium ${
                          isProfitable ? "text-green-500" : "text-red-500"
                        }`}
                        data-testid={`text-pnl-${position.id}`}
                      >
                        {isProfitable ? "+" : ""}${pnlValue.toFixed(2)}
                      </span>
                      <span
                        className={`text-sm font-mono ${
                          isProfitable ? "text-green-500/70" : "text-red-500/70"
                        }`}
                        data-testid={`text-pnl-pct-${position.id}`}
                      >
                        ({isProfitable ? "+" : ""}
                        {pnlPct.toFixed(2)}%)
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <Button
                      variant="destructive"
                      size="sm"
                      data-testid={`button-close-${position.id}`}
                      onClick={() => setPositionToClose(position.id)}
                      disabled={isClosing}
                    >
                      <X className="w-4 h-4 mr-1" />
                      {t.closePosition}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!positionToClose} onOpenChange={(open) => !open && setPositionToClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tradingMode === "live" ? t.confirmCloseLiveTitle : t.confirmClose}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tradingMode === "live" ? t.confirmCloseLiveMessage : t.confirmCloseMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-close">{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-close"
              onClick={handleCloseConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.closePosition}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
