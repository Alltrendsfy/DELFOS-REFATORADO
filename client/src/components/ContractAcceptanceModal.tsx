import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileText, AlertTriangle } from "lucide-react";

interface ContractTemplate {
  id: string;
  name: string;
  code: string;
  type: string;
  content: string;
  version: string;
  requires_acceptance: boolean;
  is_mandatory: boolean;
}

interface ContractAcceptanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  franchiseId?: string;
  onAccepted?: () => void;
}

export function ContractAcceptanceModal({
  open,
  onOpenChange,
  templateId,
  franchiseId,
  onAccepted,
}: ContractAcceptanceModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [accepted, setAccepted] = useState(false);

  const { data: templateData, isLoading } = useQuery<{ template: ContractTemplate }>({
    queryKey: ["/api/contracts/templates", templateId],
    enabled: open && !!templateId,
  });
  
  const template = templateData?.template;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/contracts/accept", "POST", {
        template_id: templateId,
        franchise_id: franchiseId,
        template_version: template?.version,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/acceptances"] });
      toast({
        title: t('contractAcceptance.acceptSuccess'),
        description: t('contractAcceptance.acceptSuccessDesc'),
      });
      setAccepted(false);
      onOpenChange(false);
      onAccepted?.();
    },
    onError: () => {
      toast({
        title: t('contractAcceptance.acceptError'),
        description: t('contractAcceptance.acceptErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const handleAccept = () => {
    if (accepted) {
      acceptMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              template?.name || t('contractAcceptance.title')
            )}
          </DialogTitle>
          <DialogDescription>
            {t('contractAcceptance.readCarefully')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : template ? (
          <>
            <ScrollArea className="h-[400px] border rounded-md p-4">
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: template.content }}
              />
            </ScrollArea>

            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
              <Checkbox
                id="accept-contract"
                checked={accepted}
                onCheckedChange={(checked) => setAccepted(checked === true)}
                data-testid="checkbox-accept-contract"
              />
              <label
                htmlFor="accept-contract"
                className="text-sm leading-relaxed cursor-pointer"
              >
                {t('contractAcceptance.iAccept')} <strong>{template.name}</strong> (v{template.version}).{" "}
                {template.is_mandatory && (
                  <span className="text-destructive">
                    {t('contractAcceptance.mandatoryNotice')}
                  </span>
                )}
              </label>
            </div>

            {template.is_mandatory && !accepted && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                {t('contractAcceptance.mustAccept')}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-muted-foreground">{t('contractAcceptance.notFound')}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-contract"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!accepted || acceptMutation.isPending || !template}
            data-testid="button-accept-contract"
          >
            {acceptMutation.isPending 
              ? t('contractAcceptance.accepting')
              : t('contractAcceptance.acceptButton')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PendingContractsListProps {
  franchiseId?: string;
  onContractAccepted?: () => void;
}

export function PendingContractsList({ franchiseId, onContractAccepted }: PendingContractsListProps) {
  const { t } = useLanguage();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const { data: pendingContracts, isLoading } = useQuery<ContractTemplate[]>({
    queryKey: ["/api/contracts/pending", franchiseId],
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!pendingContracts || pendingContracts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold">{t('contractAcceptance.pendingContracts')}</h3>
      </div>
      
      <div className="space-y-2">
        {pendingContracts.map((contract) => (
          <div
            key={contract.id}
            className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
            data-testid={`pending-contract-${contract.id}`}
          >
            <div>
              <h4 className="font-medium">{contract.name}</h4>
              <p className="text-sm text-muted-foreground">
                v{contract.version} | {contract.is_mandatory ? t('contracts.mandatory') : t('contracts.optional')}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setSelectedTemplate(contract.id)}
              data-testid={`button-review-contract-${contract.id}`}
            >
              {t('contractAcceptance.reviewAndAccept')}
            </Button>
          </div>
        ))}
      </div>

      {selectedTemplate && (
        <ContractAcceptanceModal
          open={!!selectedTemplate}
          onOpenChange={(open) => !open && setSelectedTemplate(null)}
          templateId={selectedTemplate}
          franchiseId={franchiseId}
          onAccepted={() => {
            setSelectedTemplate(null);
            onContractAccepted?.();
          }}
        />
      )}
    </div>
  );
}
