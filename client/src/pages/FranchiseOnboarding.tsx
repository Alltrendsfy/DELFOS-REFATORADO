import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Building2, 
  FileText, 
  CreditCard, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  Loader2,
  Shield,
  TrendingUp,
  Users,
  Zap
} from "lucide-react";

interface FranchisePlan {
  id: string;
  name: string;
  code: string;
  max_campaigns: number;
  max_capital_usd: string | null;
  royalty_percentage: string;
  franchise_fee_usd: string;
  max_drawdown_pct: string;
  max_position_size_pct: string;
  max_daily_trades: number;
  features: Record<string, boolean> | null;
  is_active: boolean;
}

const STEPS = [
  { id: 'plan', label: 'Plano', icon: Building2 },
  { id: 'info', label: 'Dados', icon: FileText },
  { id: 'contract', label: 'Contrato', icon: Shield },
  { id: 'payment', label: 'Pagamento', icon: CreditCard },
  { id: 'complete', label: 'Conclusão', icon: CheckCircle },
];

export default function FranchiseOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [franchiseData, setFranchiseData] = useState({
    name: '',
    cnpj: '',
    tax_id: '',
    tax_id_type: 'cnpj',
    address: '',
    country: 'BRA',
  });
  const [contractAccepted, setContractAccepted] = useState(false);
  const [createdFranchiseId, setCreatedFranchiseId] = useState<string | null>(null);

  const { data: plans, isLoading: plansLoading } = useQuery<FranchisePlan[]>({
    queryKey: ['/api/franchise-onboarding/plans'],
  });

  const startMutation = useMutation({
    mutationFn: async (data: { planId: string; name: string; cnpj?: string; tax_id?: string; tax_id_type?: string; address?: string; country?: string }) => {
      const response = await apiRequest('POST', '/api/franchise-onboarding/start', data);
      return response.json();
    },
    onSuccess: (data) => {
      setCreatedFranchiseId(data.franchiseId);
      setCurrentStep(2);
      toast({
        title: "Franquia criada",
        description: "Agora aceite o contrato para continuar.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar franquia",
        variant: "destructive",
      });
    },
  });

  const acceptContractMutation = useMutation({
    mutationFn: async (franchiseId: string) => {
      const response = await apiRequest('POST', `/api/franchise-onboarding/${franchiseId}/accept-contract`, {
        contractVersion: '1.0',
      });
      return response.json();
    },
    onSuccess: () => {
      const selectedPlan = plans?.find(p => p.id === selectedPlanId);
      const fee = parseFloat(selectedPlan?.franchise_fee_usd || '0');
      
      if (fee > 0) {
        setCurrentStep(3);
        toast({
          title: "Contrato aceito",
          description: "Agora realize o pagamento da taxa de franquia.",
        });
      } else {
        setCurrentStep(4);
        toast({
          title: "Contrato aceito",
          description: "Sua franquia está aguardando aprovação.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao aceitar contrato",
        variant: "destructive",
      });
    },
  });

  const selectedPlan = plans?.find(p => p.id === selectedPlanId);

  const handleNext = () => {
    if (currentStep === 0) {
      if (!selectedPlanId) {
        toast({ title: "Selecione um plano", variant: "destructive" });
        return;
      }
      setCurrentStep(1);
    } else if (currentStep === 1) {
      if (!franchiseData.name) {
        toast({ title: "Nome da franquia é obrigatório", variant: "destructive" });
        return;
      }
      
      const taxIdValue = franchiseData.tax_id_type === 'cnpj' 
        ? franchiseData.cnpj 
        : franchiseData.tax_id;
      
      if (!taxIdValue) {
        toast({ 
          title: `${franchiseData.tax_id_type === 'cnpj' ? 'CNPJ' : franchiseData.tax_id_type === 'cpf' ? 'CPF' : 'Tax ID'} é obrigatório`, 
          variant: "destructive" 
        });
        return;
      }
      
      const payload: {
        planId: string;
        name: string;
        cnpj?: string;
        tax_id?: string;
        tax_id_type: string;
        address?: string;
        country?: string;
      } = {
        planId: selectedPlanId!,
        name: franchiseData.name,
        tax_id_type: franchiseData.tax_id_type,
        address: franchiseData.address || undefined,
        country: franchiseData.country,
      };
      
      if (franchiseData.tax_id_type === 'cnpj') {
        payload.cnpj = franchiseData.cnpj;
      } else {
        payload.tax_id = franchiseData.tax_id;
      }
      
      startMutation.mutate(payload);
    } else if (currentStep === 2) {
      if (!contractAccepted) {
        toast({ title: "Aceite o contrato para continuar", variant: "destructive" });
        return;
      }
      if (createdFranchiseId) {
        acceptContractMutation.mutate(createdFranchiseId);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0 && currentStep < 2) {
      setCurrentStep(currentStep - 1);
    }
  };

  const formatCurrency = (value: string | null) => {
    if (!value) return 'Ilimitado';
    const num = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(num);
  };

  if (plansLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-onboarding-title">
          Seja um Franqueado DELFOS
        </h1>
        <p className="text-muted-foreground">
          Complete as etapas abaixo para iniciar sua jornada como franqueado.
        </p>
      </div>

      <div className="flex items-center justify-between mb-8">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className={`flex flex-col items-center ${index <= currentStep ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                index < currentStep ? 'bg-primary text-primary-foreground' :
                index === currentStep ? 'bg-primary/20 border-2 border-primary' :
                'bg-muted'
              }`}>
                <step.icon className="h-5 w-5" />
              </div>
              <span className="text-xs mt-1 hidden sm:block">{step.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`w-12 sm:w-24 h-0.5 mx-2 ${
                index < currentStep ? 'bg-primary' : 'bg-muted'
              }`} />
            )}
          </div>
        ))}
      </div>

      {currentStep === 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Escolha seu Plano</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans?.map((plan) => (
              <Card 
                key={plan.id}
                className={`cursor-pointer transition-all hover-elevate ${
                  selectedPlanId === plan.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedPlanId(plan.id)}
                data-testid={`card-plan-${plan.code}`}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {plan.name}
                    {selectedPlanId === plan.id && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    {parseFloat(plan.franchise_fee_usd) > 0 
                      ? formatCurrency(plan.franchise_fee_usd)
                      : 'Gratuito'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span>Até {plan.max_campaigns} campanhas</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span>Capital: {formatCurrency(plan.max_capital_usd)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Royalty: {plan.royalty_percentage}%</span>
                  </div>
                  <Separator />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Drawdown máx: {plan.max_drawdown_pct}%</div>
                    <div>Posição máx: {plan.max_position_size_pct}%</div>
                    <div>Trades/dia: {plan.max_daily_trades}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dados da Franquia</CardTitle>
            <CardDescription>
              Preencha as informações da sua franquia
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Franquia *</Label>
              <Input
                id="name"
                value={franchiseData.name}
                onChange={(e) => setFranchiseData({ ...franchiseData, name: e.target.value })}
                placeholder="Ex: DELFOS São Paulo"
                data-testid="input-franchise-name"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tax_id_type">Tipo de Documento</Label>
                <Select
                  value={franchiseData.tax_id_type}
                  onValueChange={(value) => setFranchiseData({ ...franchiseData, tax_id_type: value })}
                >
                  <SelectTrigger data-testid="select-tax-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cnpj">CNPJ (Brasil)</SelectItem>
                    <SelectItem value="cpf">CPF (Brasil)</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_id_input">
                  {franchiseData.tax_id_type === 'cnpj' ? 'CNPJ' : 
                   franchiseData.tax_id_type === 'cpf' ? 'CPF' : 'Tax ID'}
                </Label>
                <Input
                  id="tax_id_input"
                  value={franchiseData.tax_id_type === 'cnpj' ? franchiseData.cnpj : franchiseData.tax_id}
                  onChange={(e) => {
                    if (franchiseData.tax_id_type === 'cnpj') {
                      setFranchiseData({ ...franchiseData, cnpj: e.target.value });
                    } else {
                      setFranchiseData({ ...franchiseData, tax_id: e.target.value });
                    }
                  }}
                  placeholder={franchiseData.tax_id_type === 'cnpj' ? '00.000.000/0001-00' : 
                               franchiseData.tax_id_type === 'cpf' ? '000.000.000-00' : 'Tax identification number'}
                  data-testid="input-tax-id"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={franchiseData.address}
                onChange={(e) => setFranchiseData({ ...franchiseData, address: e.target.value })}
                placeholder="Endereço completo"
                data-testid="input-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <Select
                value={franchiseData.country}
                onValueChange={(value) => setFranchiseData({ ...franchiseData, country: value })}
              >
                <SelectTrigger data-testid="select-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRA">Brasil</SelectItem>
                  <SelectItem value="USA">Estados Unidos</SelectItem>
                  <SelectItem value="PRT">Portugal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedPlan && (
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2">Plano Selecionado: {selectedPlan.name}</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>Taxa de Franquia: {formatCurrency(selectedPlan.franchise_fee_usd)}</div>
                  <div>Royalty: {selectedPlan.royalty_percentage}% sobre lucro líquido</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Contrato de Franquia</CardTitle>
            <CardDescription>
              Leia e aceite os termos do contrato
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg h-64 overflow-y-auto text-sm">
              <h4 className="font-bold mb-2">CONTRATO DE FRANQUIA DELFOS</h4>
              <p className="mb-2">Versão 1.0 - Dezembro 2024</p>
              <Separator className="my-4" />
              <p className="mb-2">
                <strong>1. OBJETO</strong><br />
                Este contrato estabelece os termos e condições para operação como franqueado 
                da plataforma DELFOS de trading automatizado de criptomoedas.
              </p>
              <p className="mb-2">
                <strong>2. MODELO DE NEGÓCIO</strong><br />
                - O DELFOS NÃO opera capital próprio<br />
                - O franqueado opera com capital próprio<br />
                - A franqueadora ganha quando o franqueado ganha (royalties)<br />
                - Royalties são calculados apenas sobre lucro líquido realizado
              </p>
              <p className="mb-2">
                <strong>3. RESPONSABILIDADES DO FRANQUEADO</strong><br />
                - Conectar corretora própria (somente API de trade)<br />
                - Definir capital disponível dentro dos limites do plano<br />
                - Tomar decisões sobre Opportunity Blueprints<br />
                - Arcar com riscos e resultados das operações
              </p>
              <p className="mb-2">
                <strong>4. RESPONSABILIDADES DA FRANQUEADORA</strong><br />
                - Fornecer infraestrutura e tecnologia<br />
                - Gerar Opportunity Blueprints via IA<br />
                - Monitorar risco e circuit breakers<br />
                - Calcular e auditar royalties
              </p>
              <p className="mb-2">
                <strong>5. ROYALTIES</strong><br />
                Conforme plano contratado, sobre lucro líquido realizado.
                Sem lucro = sem royalty.
              </p>
              <p className="mb-2">
                <strong>6. VIGÊNCIA</strong><br />
                Contrato por prazo indeterminado, renovável automaticamente.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="accept"
                checked={contractAccepted}
                onCheckedChange={(checked) => setContractAccepted(checked === true)}
                data-testid="checkbox-accept-contract"
              />
              <Label htmlFor="accept" className="text-sm leading-relaxed">
                Li e aceito os termos do Contrato de Franquia DELFOS. Compreendo que 
                opero com capital próprio e que a franqueadora não é responsável por 
                eventuais prejuízos nas operações.
              </Label>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagamento da Taxa de Franquia</CardTitle>
            <CardDescription>
              Realize o pagamento para ativar sua franquia
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-6 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">Valor a pagar:</p>
              <p className="text-3xl font-bold text-primary">
                {formatCurrency(selectedPlan?.franchise_fee_usd || '0')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">PIX</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Escaneie o QR Code ou copie a chave PIX:
                </p>
                <code className="text-xs bg-muted p-2 rounded block">
                  delfos@franquia.com.br
                </code>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Transferência Bancária</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Banco: 001 - Banco do Brasil</p>
                  <p>Agência: 0001</p>
                  <p>Conta: 12345-6</p>
                  <p>CNPJ: 00.000.000/0001-00</p>
                </div>
              </div>
            </div>

            <Badge variant="secondary" className="w-full justify-center py-2">
              Após o pagamento, sua franquia será aprovada em até 24 horas
            </Badge>
          </CardContent>
        </Card>
      )}

      {currentStep === 4 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Onboarding Concluído!</CardTitle>
            <CardDescription>
              Sua franquia está aguardando aprovação da franqueadora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground">
              Você receberá uma notificação quando sua franquia for aprovada.
              Enquanto isso, você pode explorar a plataforma.
            </p>

            <div className="flex flex-col gap-2">
              <Button 
                onClick={() => setLocation('/')}
                data-testid="button-go-dashboard"
              >
                Ir para o Dashboard
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setLocation('/franchises')}
                data-testid="button-view-franchises"
              >
                Ver Minhas Franquias
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep < 4 && (
        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || currentStep >= 2}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <Button
            onClick={handleNext}
            disabled={
              startMutation.isPending || 
              acceptContractMutation.isPending ||
              currentStep === 3
            }
            data-testid="button-next"
          >
            {(startMutation.isPending || acceptContractMutation.isPending) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {currentStep === 0 ? 'Continuar' :
             currentStep === 1 ? 'Criar Franquia' :
             currentStep === 2 ? 'Aceitar Contrato' :
             'Próximo'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
