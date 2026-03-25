"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import {
  ArrowLeft,
  Users,
  Loader2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
} from "lucide-react";

interface Persona {
  id: string;
  display_name?: string;
  name?: string;
  description: string;
  strategy_type?: string;
  type?: string;
  active: boolean;
  is_active?: boolean;
}

interface PersonasResponse {
  personas: Persona[];
}

export default function PersonasPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formRisk, setFormRisk] = useState("moderate");

  const personas = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const res = await apiClient.get<PersonasResponse>("/api/v1/agents/personas");
      if (res.error) throw new Error(res.error);
      const personas = res.data?.personas ?? [];
      return personas.map((p) => ({
        ...p,
        active: p.active ?? p.is_active ?? false,
      }));
    },
    retry: false,
  });

  const togglePersona = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (active) {
        const res = await apiClient.post(`/api/v1/agents/personas/${id}/activate`);
        if (res.error) throw new Error(res.error);
        return res.data;
      } else {
        const res = await apiClient.patch(`/api/v1/agents/personas/${id}/config`, {
          auto_trade_enabled: false,
        });
        if (res.error) throw new Error(res.error);
        return res.data;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personas"] }),
  });

  const createPersona = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ persona: Persona }>("/api/v1/agents/personas/custom", {
        name: formName,
        description: formDesc,
        system_prompt: formPrompt,
        risk_level: formRisk,
      });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      setCreateOpen(false);
      setFormName("");
      setFormDesc("");
      setFormPrompt("");
      setFormRisk("moderate");
    },
  });

  const deletePersona = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/api/v1/agents/personas/${id}`);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personas"] }),
  });

  const builtins = personas.data?.filter((p) => p.type !== "custom") ?? [];
  const custom = personas.data?.filter((p) => p.type === "custom") ?? [];

  const renderPersonaCard = (persona: Persona, canDelete: boolean) => (
    <div
      key={persona.id}
      className="flex items-start justify-between rounded-lg border p-4"
    >
      <div className="space-y-1 flex-1 mr-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{persona.display_name || persona.name}</h3>
          {persona.type === "custom" && (
            <Badge variant="outline" className="text-xs">Custom</Badge>
          )}
          {persona.strategy_type && (
            <Badge variant="outline" className="text-xs">{persona.strategy_type}</Badge>
          )}
          {persona.active && (
            <Badge variant="secondary" className="text-xs">Active</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{persona.description}</p>
      </div>
      <div className="flex items-center gap-1">
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deletePersona.mutate(persona.id)}
            disabled={deletePersona.isPending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => togglePersona.mutate({ id: persona.id, active: !persona.active })}
          disabled={togglePersona.isPending}
          className={persona.active ? "text-primary" : "text-muted-foreground"}
        >
          {persona.active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
        </Button>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen">
      <div className="px-6 pt-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Chat
        </Link>
      </div>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Personas</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your AI trading personas and strategies
              </p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Persona
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Custom Persona</DialogTitle>
                  <DialogDescription>
                    Define a custom AI trading persona with your own strategy prompt.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="My Strategy"
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="A brief description of your persona"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Strategy Prompt</label>
                    <textarea
                      value={formPrompt}
                      onChange={(e) => setFormPrompt(e.target.value)}
                      placeholder="Describe how this persona should analyze trades and make decisions..."
                      maxLength={2000}
                      rows={4}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formPrompt.length}/2000 characters
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Risk Level</label>
                    <select
                      value={formRisk}
                      onChange={(e) => setFormRisk(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createPersona.mutate()}
                    disabled={createPersona.isPending || !formName || !formDesc || !formPrompt}
                  >
                    {createPersona.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Create
                  </Button>
                </DialogFooter>
                {createPersona.isError && (
                  <p className="text-sm text-destructive">
                    {createPersona.error?.message || "Failed to create persona"}
                  </p>
                )}
              </DialogContent>
            </Dialog>
          </div>

          {/* Built-in Personas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Built-in Personas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {personas.isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Loading personas...</p>
                </div>
              ) : personas.isError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {personas.error?.message || "Unable to load personas"}
                  </p>
                </div>
              ) : builtins.length > 0 ? (
                <div className="space-y-4">
                  {builtins.map((p) => renderPersonaCard(p, false))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No built-in personas available</p>
              )}
            </CardContent>
          </Card>

          {/* Custom Personas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                My Custom Personas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {personas.isLoading ? null : custom.length > 0 ? (
                <div className="space-y-4">
                  {custom.map((p) => renderPersonaCard(p, true))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No custom personas yet. Create one to get started.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </main>
  );
}
