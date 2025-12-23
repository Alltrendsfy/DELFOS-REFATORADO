import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
  Zap,
  Upload
} from "lucide-react";

interface FranchisePlan {
  id: string;
  name: string;
  code: string;
  max_campaigns: number;
  max_capital_usd: string | null;
  royalty_percentage: string;
  franchise_fee_brl: string;
  max_drawdown_pct: string;
  max_position_size_pct: string;
  max_daily_trades: number;
  features: Record<string, boolean> | null;
  is_active: boolean;
}

interface ContractTemplate {
  id: string;
  version: string;
  content: string;
  is_active: boolean;
}

const STEPS = [
  { id: 'plan', label: 'Plano', icon: Building2 },
  { id: 'info', label: 'Dados Pessoais', icon: FileText },
  { id: 'docs', label: 'Documentos', icon: Upload },
  { id: 'contract', label: 'Contrato', icon: Shield },
  { id: 'payment', label: 'Pagamento', icon: CreditCard },
];

// Etapa 1: Dados Pessoais schema
const personalDataSchema = z.object({
  name: z.string().min(3, "Nome completo obrigatório"),
  trade_name: z.string().min(1, "Nome fantasia obrigatório"),
  document_type: z.enum(['cpf', 'cnpj']),
  document_number: z.string().min(11, "Número de documento inválido"),
  secondary_document: z.string().optional(),
  birth_date: z.string().optional(),
  email: z.string().email("Email inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  whatsapp: z.string().optional(),
  address_street: z.string().min(3, "Endereço obrigatório"),
  address_number: z.string().min(1, "Número obrigatório"),
  address_complement: z.string().optional(),
  address_neighborhood: z.string().min(2, "Bairro obrigatório"),
  address_zip: z.string().min(8, "CEP inválido"),
  address_city: z.string().min(2, "Cidade obrigatória"),
  address_country: z.string().default("BRA"),
});

type PersonalData = z.infer<typeof personalDataSchema>;

export default function FranchiseOnboarding() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [contractScrolled, setContractScrolled] = useState(false);
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);

  // Get plan from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1]);
    const planCode = params.get('plan');
    if (planCode) {
      setSelectedPlanId(planCode);
    }
  }, [location]);

  const form = useForm<PersonalData>({
    resolver: zodResolver(personalDataSchema),
    defaultValues: {
      document_type: 'cpf',
      address_country: 'BRA',
    },
  });

  const { data: plans, isLoading: plansLoading } = useQuery<FranchisePlan[]>({
    queryKey: ['/api/franchise-plans'],
  });

  const { data: contract } = useQuery<ContractTemplate>({
    queryKey: ['/api/contract-templates/active'],
  });

  const createLeadMutation = useMutation({
    mutationFn: async (data: PersonalData) => {
      return apiRequest<{ id: string }>('/api/franchise-leads', 'POST', {
        ...data,
        plan_id: selectedPlanId,
      });
    },
    onSuccess: (data) => {
      if (data?.id) {
        setCreatedLeadId(data.id);
      }
      setCurrentStep(2);
      toast({
        title: "Dados salvos",
        description: "Agora envie os documentos necessários.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const acceptContractMutation = useMutation({
    mutationFn: async () => {
      if (!createdLeadId || !contract) return;
      return apiRequest('POST', `/api/franchise-leads/${createdLeadId}/accept-contract`, {
        contract_version: contract.version,
      });
    },
    onSuccess: () => {
      const selectedPlan = plans?.find(p => p.id === selectedPlanId);
      const fee = parseFloat(selectedPlan?.franchise_fee_brl || '0');
      
      if (fee > 0) {
        setCurrentStep(4);
        toast({
          title: "Contrato aceito",
          description: "Agora realize o pagamento.",
        });
      } else {
        setCurrentStep(4);
        toast({
          title: "Contrato aceito",
          description: "Sua aplicação está em análise.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectedPlan = plans?.find(p => p.id === selectedPlanId);

  const handleStepOne = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;
    
    const data = form.getValues();
    try {
      const res = await createLeadMutation.mutateAsync(data);
      if (res?.id) {
        setCreatedLeadId(res.id);
      }
      setCurrentStep(2);
    } catch (err) {
      console.error("Error in step 1:", err);
    }
  };

  const handleStepTwo = () => {
    const docType = form.getValues('document_type');
    const requiredDocs = docType === 'cpf' ? ['rg_cpf'] : ['social_contract'];
    
    if (uploadedDocs.length === 0) {
      toast({
        title: "Documentos obrigatórios",
        description: `Envie ${docType === 'cpf' ? 'RG/CPF' : 'Contrato Social'}`,
        variant: "destructive",
      });
      return;
    }
    
    setCurrentStep(3);
  };

  const handleStepThree = async () => {
    if (!contractAccepted) {
      toast({
        title: "Contrato não aceito",
        description: "Você deve aceitar os termos para continuar",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await acceptContractMutation.mutateAsync();
      const selectedPlan = plans?.find(p => p.id === selectedPlanId);
      const fee = parseFloat(selectedPlan?.franchise_fee_brl || '0');
      
      if (fee > 0) {
        setCurrentStep(4);
        toast({
          title: "Contrato aceito",
          description: "Agora realize o pagamento.",
        });
      } else {
        setCurrentStep(4);
        toast({
          title: "Contrato aceito",
          description: "Sua aplicação está em análise.",
        });
      }
    } catch (err) {
      console.error("Error in contract step:", err);
    }
  };

  const formatCurrency = (value: string | null) => {
    if (!value) return 'Ilimitado';
    const num = parseFloat(value);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
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

      {/* Progress Steps */}
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

      {/* Etapa 0: Seleção de Plano */}
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
                    {parseFloat(plan.franchise_fee_brl) > 0 
                      ? formatCurrency(plan.franchise_fee_brl)
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

      {/* Etapa 1: Dados Pessoais */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dados Pessoais</CardTitle>
            <CardDescription>
              Preencha suas informações pessoais
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleStepOne)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo *</FormLabel>
                        <FormControl>
                          <Input placeholder="Seu nome completo" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="trade_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Fantasia *</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome da sua empresa" {...field} data-testid="input-trade-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="document_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Documento *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-document-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cpf">CPF (Pessoa Física)</SelectItem>
                            <SelectItem value="cnpj">CNPJ (Pessoa Jurídica)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="document_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{form.watch('document_type') === 'cpf' ? 'CPF' : 'CNPJ'} *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={form.watch('document_type') === 'cpf' ? '000.000.000-00' : '00.000.000/0001-00'} 
                            {...field} 
                            data-testid="input-document-number" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch('document_type') === 'cpf' && (
                  <FormField
                    control={form.control}
                    name="secondary_document"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>RG</FormLabel>
                        <FormControl>
                          <Input placeholder="RG" {...field} data-testid="input-rg" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="birth_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Nascimento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-birth-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="seu@email.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone *</FormLabel>
                        <FormControl>
                          <Input placeholder="(00) 0000-0000" {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="whatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp</FormLabel>
                      <FormControl>
                        <Input placeholder="(00) 99999-9999" {...field} data-testid="input-whatsapp" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-4" />

                <div className="text-lg font-semibold">Endereço</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="address_zip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CEP *</FormLabel>
                        <FormControl>
                          <Input placeholder="00000-000" {...field} data-testid="input-zip" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address_street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rua *</FormLabel>
                      <FormControl>
                        <Input placeholder="Rua Principal" {...field} data-testid="input-street" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="address_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número *</FormLabel>
                        <FormControl>
                          <Input placeholder="123" {...field} data-testid="input-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address_complement"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Complemento</FormLabel>
                        <FormControl>
                          <Input placeholder="Apto 101" {...field} data-testid="input-complement" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address_neighborhood"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bairro *</FormLabel>
                        <FormControl>
                          <Input placeholder="Centro" {...field} data-testid="input-neighborhood" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="address_city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade *</FormLabel>
                        <FormControl>
                          <Input placeholder="São Paulo" {...field} data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address_country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>País *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BRA">Brasil</SelectItem>
                            <SelectItem value="USA">Estados Unidos</SelectItem>
                            <SelectItem value="PRT">Portugal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {selectedPlan && (
                  <div className="bg-muted p-4 rounded-lg mt-4">
                    <h4 className="font-medium mb-2">Plano Selecionado: {selectedPlan.name}</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Taxa de Franquia: {formatCurrency(selectedPlan.franchise_fee_brl)}</div>
                      <div>Royalty: {selectedPlan.royalty_percentage}% sobre lucro líquido</div>
                    </div>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full mt-6"
                  disabled={createLeadMutation.isPending}
                  data-testid="button-save-personal-data"
                >
                  {createLeadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Continuar
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Etapa 2: Upload Documentos */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Enviar Documentos</CardTitle>
            <CardDescription>
              {form.watch('document_type') === 'cpf' 
                ? 'Envie cópia do RG/CPF' 
                : 'Envie o Contrato Social'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Clique para selecionar ou arraste os arquivos
              </p>
              <Input 
                type="file" 
                multiple 
                accept="image/*,.pdf"
                data-testid="input-documents"
                className="hidden"
                id="docs-input"
              />
              <Button variant="outline" onClick={() => document.getElementById('docs-input')?.click()}>
                Selecionar Arquivos
              </Button>
              {uploadedDocs.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">{uploadedDocs.length} arquivo(s) selecionado(s)</p>
                </div>
              )}
            </div>

            <Button 
              className="w-full" 
              onClick={handleStepTwo}
              data-testid="button-confirm-docs"
            >
              Continuar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Etapa 3: Contrato */}
      {currentStep === 3 && contract && (
        <Card>
          <CardHeader>
            <CardTitle>Contrato de Adesão</CardTitle>
            <CardDescription>
              Leia e aceite os termos - versão {contract.version}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div 
              className="bg-muted p-4 rounded-lg h-80 overflow-y-auto text-sm border"
              onScroll={(e) => {
                const element = e.currentTarget;
                const isScrolledToBottom = element.scrollHeight - element.scrollTop < element.clientHeight + 10;
                setContractScrolled(isScrolledToBottom);
              }}
              data-testid="div-contract-scroll"
            >
              <div dangerouslySetInnerHTML={{ __html: contract.content }} />
            </div>

            {!contractScrolled && (
              <Badge variant="secondary" className="w-full justify-center">
                Role até o final para aceitar
              </Badge>
            )}

            <div className="flex items-start gap-3">
              <Checkbox
                id="accept"
                checked={contractAccepted}
                onCheckedChange={(checked) => setContractAccepted(checked === true)}
                disabled={!contractScrolled}
                data-testid="checkbox-accept-contract"
              />
              <Label htmlFor="accept" className="text-sm leading-relaxed cursor-pointer">
                Li e aceito os termos do Contrato de Adesão DELFOS. Compreendo que opero com capital próprio.
              </Label>
            </div>

            <Button 
              className="w-full" 
              onClick={handleStepThree}
              disabled={!contractAccepted || acceptContractMutation.isPending}
              data-testid="button-accept-contract"
            >
              {acceptContractMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aceitar e Continuar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Etapa 4: Pagamento */}
      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagamento da Taxa de Franquia</CardTitle>
            <CardDescription>
              Escolha o método de pagamento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-6 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">Valor a pagar:</p>
              <p className="text-3xl font-bold text-primary">
                {formatCurrency(selectedPlan?.franchise_fee_brl || '0')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="border rounded-lg p-4 hover-elevate cursor-pointer transition-all" data-testid="option-pix">
                <h4 className="font-medium mb-2">PIX</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Transferência instantânea
                </p>
              </div>

              <div className="border rounded-lg p-4 hover-elevate cursor-pointer transition-all" data-testid="option-boleto">
                <h4 className="font-medium mb-2">Boleto Bancário</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Processado em 1-2 dias úteis
                </p>
              </div>

              <div className="border rounded-lg p-4 hover-elevate cursor-pointer transition-all" data-testid="option-card">
                <h4 className="font-medium mb-2">Cartão de Crédito</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Processado imediatamente
                </p>
              </div>
            </div>

            <Badge variant="secondary" className="w-full justify-center py-2">
              Sua franquia será aprovada em até 24 horas após o pagamento
            </Badge>

            <Button className="w-full" data-testid="button-proceed-payment">
              Prosseguir para Pagamento
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {currentStep < 4 && (
        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          {currentStep === 0 && (
            <Button
              onClick={() => setCurrentStep(1)}
              disabled={!selectedPlanId}
              data-testid="button-next-plan"
            >
              Continuar
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
