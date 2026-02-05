import React, { useState, useEffect, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { 
  Plus, 
  Search, 
  FileText, 
  Trash2, 
  Edit3, 
  Download, 
  Eye,
  X,
  Upload,
  Link as LinkIcon,
  Copy,
  Check,
  Filter,
  Send,
  Paperclip,
  ExternalLink,
  Image as ImageIcon,
  MessageCircle
} from 'lucide-react';
import './App.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const STATUS_OPTIONS = ["Em aberto", "Confirmado", "Em aprovação", "Finalizado"];
const STATUS_COLORS = {
  "Em aberto": "bg-gray-100 text-gray-800 border-gray-300",
  "Confirmado": "bg-gray-200 text-gray-900 border-gray-400",
  "Em aprovação": "bg-gray-300 text-gray-900 border-gray-500",
  "Finalizado": "bg-black text-white border-black"
};

function App() {
  const [view, setView] = useState('painel'); // 'painel' or 'solicitar'
  const [demandas, setDemandas] = useState([]);
  const [solicitantes, setSolicitantes] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSolicitante, setFilterSolicitante] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showSolicitacao, setShowSolicitacao] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(null);
  const [showEntrega, setShowEntrega] = useState(null);
  
  // Form state
  const [formSolicitante, setFormSolicitante] = useState('');
  const [formDemanda, setFormDemanda] = useState('');
  const [formRefLinks, setFormRefLinks] = useState('');
  const [formRefFiles, setFormRefFiles] = useState([]);
  const [newSolicitante, setNewSolicitante] = useState('');
  
  // Entrega form
  const [entregaLinks, setEntregaLinks] = useState('');
  const [entregaFiles, setEntregaFiles] = useState([]);
  
  // Success modal
  const [successData, setSuccessData] = useState(null);
  const [copiedNum, setCopiedNum] = useState(false);

  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  const fetchDemandas = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterMonth) params.append('month', filterMonth);
      if (filterYear) params.append('year', filterYear);
      if (filterStatus) params.append('status', filterStatus);
      if (filterSolicitante) params.append('solicitante', filterSolicitante);
      if (searchQuery) params.append('search', searchQuery);
      
      const url = `${API_URL}/api/demandas${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao carregar demandas');
      const data = await res.json();
      setDemandas(data);
    } catch (error) {
      toast.error('Erro ao carregar demandas');
    } finally {
      setIsLoading(false);
    }
  }, [filterMonth, filterYear, filterStatus, filterSolicitante, searchQuery]);

  const fetchSolicitantes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/solicitantes`);
      if (res.ok) {
        const data = await res.json();
        setSolicitantes(data);
      }
    } catch (error) {
      console.error('Erro ao carregar solicitantes');
    }
  };

  const fetchMonths = async () => {
    try {
      const res = await fetch(`${API_URL}/api/months`);
      if (res.ok) {
        const data = await res.json();
        setAvailableMonths(data);
      }
    } catch (error) {
      console.error('Erro ao carregar meses');
    }
  };

  useEffect(() => {
    fetchDemandas();
    fetchSolicitantes();
    fetchMonths();
  }, [fetchDemandas]);

  const handleCreateSolicitacao = async (e) => {
    e.preventDefault();
    
    if (!formSolicitante.trim() || !formDemanda.trim()) {
      toast.error('Preencha solicitante e demanda');
      return;
    }

    const submitData = new FormData();
    submitData.append('solicitante', formSolicitante);
    submitData.append('demanda', formDemanda);
    if (formRefLinks) submitData.append('referencia_links', formRefLinks);
    formRefFiles.forEach(file => submitData.append('referencia_files', file));

    try {
      const res = await fetch(`${API_URL}/api/demandas`, {
        method: 'POST',
        body: submitData
      });

      if (!res.ok) throw new Error('Erro ao criar demanda');
      
      const data = await res.json();
      setSuccessData(data);
      resetForm();
      fetchDemandas();
      fetchSolicitantes();
      fetchMonths();
    } catch (error) {
      toast.error('Erro ao criar demanda');
    }
  };

  const handleAddSolicitante = async () => {
    if (!newSolicitante.trim()) return;
    
    const formData = new FormData();
    formData.append('nome', newSolicitante);
    
    try {
      const res = await fetch(`${API_URL}/api/solicitantes`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setSolicitantes(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
        setFormSolicitante(data.nome);
        setNewSolicitante('');
        toast.success('Solicitante adicionado');
      }
    } catch (error) {
      toast.error('Erro ao adicionar solicitante');
    }
  };

  const handleUpdateStatus = async (demandaId, newStatus) => {
    const formData = new FormData();
    formData.append('status', newStatus);
    
    try {
      const res = await fetch(`${API_URL}/api/demandas/${demandaId}/status`, {
        method: 'PUT',
        body: formData
      });
      if (!res.ok) throw new Error('Erro ao atualizar status');
      toast.success('Status atualizado');
      fetchDemandas();
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleAddEntrega = async (e) => {
    e.preventDefault();
    if (!showEntrega) return;
    
    if (!entregaLinks && entregaFiles.length === 0) {
      toast.error('Adicione um link ou arquivo');
      return;
    }

    const submitData = new FormData();
    if (entregaLinks) submitData.append('entrega_links', entregaLinks);
    entregaFiles.forEach(file => submitData.append('entrega_files', file));

    try {
      const res = await fetch(`${API_URL}/api/demandas/${showEntrega}/entregas`, {
        method: 'POST',
        body: submitData
      });
      if (!res.ok) throw new Error('Erro ao adicionar entrega');
      toast.success('Entrega adicionada');
      setShowEntrega(null);
      setEntregaLinks('');
      setEntregaFiles([]);
      fetchDemandas();
    } catch (error) {
      toast.error('Erro ao adicionar entrega');
    }
  };

  const handleDeleteDemanda = async (demandaId) => {
    if (!window.confirm('Excluir esta demanda?')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/demandas/${demandaId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Erro ao excluir');
      toast.success('Demanda excluída');
      fetchDemandas();
    } catch (error) {
      toast.error('Erro ao excluir demanda');
    }
  };

  const handleDownloadPDF = async () => {
    const month = filterMonth || currentMonth;
    const year = filterYear || currentYear;
    
    try {
      const res = await fetch(`${API_URL}/api/relatorio/${month}/${year}/pdf`);
      if (!res.ok) throw new Error('Nenhuma demanda neste mês');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio_${month}-${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('PDF baixado!');
    } catch (error) {
      toast.error('Erro ao gerar PDF');
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyWhatsApp = async (demanda) => {
    try {
      const res = await fetch(`${API_URL}/api/demandas/${demanda.id}/whatsapp`);
      if (!res.ok) throw new Error('Erro');
      const data = await res.json();
      const success = await copyToClipboard(data.text);
      if (success) toast.success('Copiado para WhatsApp!');
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const resetForm = () => {
    setFormSolicitante('');
    setFormDemanda('');
    setFormRefLinks('');
    setFormRefFiles([]);
  };

  const getMonthName = (monthYear) => {
    const months = {
      '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
      '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
      '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };
    if (!monthYear) return '';
    const [m, y] = monthYear.split('/');
    return `${months[m]} ${y}`;
  };

  return (
    <div className="min-h-screen bg-surface">
      <Toaster position="top-right" toastOptions={{ className: 'border border-black' }} />
      
      {/* Header */}
      <header className="bg-white border-b-2 border-black sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-heading text-2xl font-bold text-black" data-testid="app-title">
                Sistema de Demandas
              </h1>
              <p className="text-sm text-gray-500 mt-1 font-body">
                Assessoria de Comunicação • Prefeitura de Canaã dos Carajás
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('solicitar')}
                className={`px-4 py-2 text-sm font-medium uppercase tracking-wide transition-colors ${view === 'solicitar' ? 'bg-black text-white' : 'bg-white text-black border border-black hover:bg-gray-100'}`}
                data-testid="btn-view-solicitar"
              >
                <Send size={16} className="inline mr-2" />
                Nova Solicitação
              </button>
              <button
                onClick={() => setView('painel')}
                className={`px-4 py-2 text-sm font-medium uppercase tracking-wide transition-colors ${view === 'painel' ? 'bg-black text-white' : 'bg-white text-black border border-black hover:bg-gray-100'}`}
                data-testid="btn-view-painel"
              >
                <FileText size={16} className="inline mr-2" />
                Painel
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* ========== TELA DE SOLICITAÇÃO ========== */}
        {view === 'solicitar' && (
          <div className="max-w-2xl mx-auto animate-fadeIn">
            <div className="card p-8">
              <h2 className="font-heading text-xl font-bold mb-6">Nova Solicitação</h2>
              
              <form onSubmit={handleCreateSolicitacao} data-testid="form-solicitacao">
                {/* Solicitante */}
                <div className="mb-6">
                  <label className="label">Solicitante</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {solicitantes.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setFormSolicitante(s.nome)}
                        className={`px-4 py-2 text-sm border transition-colors ${
                          formSolicitante === s.nome 
                            ? 'bg-black text-white border-black' 
                            : 'bg-white text-black border-gray-300 hover:border-black'
                        }`}
                        data-testid={`solicitante-tag-${s.id}`}
                      >
                        {s.nome}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ou digite novo nome..."
                      value={newSolicitante}
                      onChange={(e) => setNewSolicitante(e.target.value)}
                      className="input-field flex-1"
                      data-testid="input-new-solicitante"
                    />
                    <button
                      type="button"
                      onClick={handleAddSolicitante}
                      className="btn-secondary px-4"
                      data-testid="btn-add-solicitante"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  {formSolicitante && (
                    <p className="text-sm text-gray-600 mt-2">
                      Selecionado: <strong>{formSolicitante}</strong>
                    </p>
                  )}
                </div>

                {/* Demanda */}
                <div className="mb-6">
                  <label className="label">Demanda *</label>
                  <textarea
                    value={formDemanda}
                    onChange={(e) => setFormDemanda(e.target.value)}
                    placeholder="Descreva o que precisa..."
                    rows={4}
                    className="textarea-field"
                    data-testid="input-demanda"
                  />
                </div>

                {/* Referências */}
                <div className="mb-6">
                  <label className="label">Referências (opcional)</label>
                  <input
                    type="text"
                    placeholder="Cole links separados por vírgula..."
                    value={formRefLinks}
                    onChange={(e) => setFormRefLinks(e.target.value)}
                    className="input-field mb-3"
                    data-testid="input-ref-links"
                  />
                  <label className="file-upload block cursor-pointer">
                    <Upload className="mx-auto mb-2 text-gray-400" size={24} />
                    <p className="text-gray-500 text-sm">
                      {formRefFiles.length > 0 
                        ? `${formRefFiles.length} arquivo(s) selecionado(s)` 
                        : 'Clique para anexar imagens/prints'}
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setFormRefFiles(Array.from(e.target.files))}
                      className="hidden"
                      data-testid="input-ref-files"
                    />
                  </label>
                </div>

                <button type="submit" className="btn-primary w-full" data-testid="btn-submit-solicitacao">
                  <Send size={18} className="inline mr-2" />
                  Enviar Solicitação
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========== PAINEL DE CONTROLE ========== */}
        {view === 'painel' && (
          <div className="animate-fadeIn">
            {/* Filters */}
            <div className="card p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-500" />
                  <span className="text-sm font-medium uppercase tracking-wide">Filtros:</span>
                </div>
                
                <select
                  value={filterMonth ? `${filterMonth}/${filterYear}` : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [m, y] = e.target.value.split('/');
                      setFilterMonth(m);
                      setFilterYear(y);
                    } else {
                      setFilterMonth('');
                      setFilterYear('');
                    }
                  }}
                  className="border-2 border-gray-200 px-3 py-2 text-sm focus:border-black"
                  data-testid="filter-month"
                >
                  <option value="">Todos os meses</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{getMonthName(m)}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="border-2 border-gray-200 px-3 py-2 text-sm focus:border-black"
                  data-testid="filter-status"
                >
                  <option value="">Todos status</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <select
                  value={filterSolicitante}
                  onChange={(e) => setFilterSolicitante(e.target.value)}
                  className="border-2 border-gray-200 px-3 py-2 text-sm focus:border-black"
                  data-testid="filter-solicitante"
                >
                  <option value="">Todos solicitantes</option>
                  {solicitantes.map((s) => (
                    <option key={s.id} value={s.nome}>{s.nome}</option>
                  ))}
                </select>

                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full border-2 border-gray-200 px-3 py-2 pl-10 text-sm focus:border-black"
                      data-testid="input-search"
                    />
                  </div>
                </div>

                <button
                  onClick={handleDownloadPDF}
                  className="btn-primary text-sm px-4 py-2"
                  data-testid="btn-download-pdf"
                >
                  <Download size={16} className="inline mr-2" />
                  PDF Mensal
                </button>
              </div>
            </div>

            {/* Demandas List */}
            {isLoading ? (
              <div className="text-center py-12 text-gray-500">Carregando...</div>
            ) : demandas.length === 0 ? (
              <div className="card text-center py-12" data-testid="empty-state">
                <FileText className="mx-auto mb-4 text-gray-300" size={48} />
                <p className="text-gray-500 mb-4">Nenhuma demanda encontrada</p>
                <button onClick={() => setView('solicitar')} className="btn-secondary">
                  Criar primeira demanda
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {demandas.map((demanda, index) => (
                  <div 
                    key={demanda.id} 
                    className="card animate-fadeIn"
                    style={{ animationDelay: `${index * 30}ms` }}
                    data-testid={`demanda-card-${demanda.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="font-mono text-sm font-bold bg-gray-100 px-3 py-1 border border-gray-300">
                            {demanda.numero}
                          </span>
                          <span className="text-sm text-gray-600">
                            {demanda.solicitante}
                          </span>
                          <span className="text-xs text-gray-400">
                            {getMonthName(demanda.month_year)}
                          </span>
                        </div>
                        
                        {/* Demanda text */}
                        <p className="text-gray-800 mb-3">{demanda.demanda}</p>
                        
                        {/* Status selector */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {STATUS_OPTIONS.map((status) => (
                            <button
                              key={status}
                              onClick={() => handleUpdateStatus(demanda.id, status)}
                              className={`px-3 py-1 text-xs font-medium border transition-all ${
                                demanda.status === status 
                                  ? STATUS_COLORS[status] 
                                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                              }`}
                              data-testid={`status-btn-${demanda.id}-${status}`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>

                        {/* Entregas */}
                        {demanda.entregas && demanda.entregas.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Entregas:</p>
                            <div className="flex flex-wrap gap-2">
                              {demanda.entregas.map((e, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 border">
                                  {e.type === 'link' ? <ExternalLink size={12} /> : <Paperclip size={12} />}
                                  {e.type === 'link' ? 'Link' : e.filename}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => setShowEntrega(demanda.id)}
                          className="btn-ghost p-2"
                          title="Adicionar entrega"
                          data-testid={`btn-entrega-${demanda.id}`}
                        >
                          <Paperclip size={18} />
                        </button>
                        <button
                          onClick={() => handleCopyWhatsApp(demanda)}
                          className="btn-ghost p-2"
                          title="Copiar para WhatsApp"
                          data-testid={`btn-whatsapp-${demanda.id}`}
                        >
                          <MessageCircle size={18} />
                        </button>
                        <button
                          onClick={() => setShowDetalhes(demanda)}
                          className="btn-ghost p-2"
                          title="Ver detalhes"
                          data-testid={`btn-detalhes-${demanda.id}`}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteDemanda(demanda.id)}
                          className="btn-ghost p-2 hover:text-red-600"
                          title="Excluir"
                          data-testid={`btn-delete-${demanda.id}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========== SUCCESS MODAL ========== */}
      {successData && (
        <div className="modal-overlay" onClick={() => setSuccessData(null)}>
          <div className="modal-content max-w-md text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6">
              <div className="w-16 h-16 bg-black text-white mx-auto flex items-center justify-center mb-4">
                <Check size={32} />
              </div>
              <h2 className="font-heading text-xl font-bold mb-2">Demanda Criada!</h2>
              <p className="text-gray-600">Sua solicitação foi registrada.</p>
            </div>
            
            <div className="bg-gray-100 p-4 border-2 border-black mb-6">
              <p className="font-mono text-2xl font-bold">{successData.numero}</p>
              <button
                onClick={async () => {
                  const success = await copyToClipboard(successData.numero);
                  if (success) {
                    setCopiedNum(true);
                    setTimeout(() => setCopiedNum(false), 2000);
                  }
                }}
                className="mt-2 text-sm text-gray-600 hover:text-black flex items-center gap-1 mx-auto"
                data-testid="btn-copy-numero"
              >
                {copiedNum ? <Check size={14} /> : <Copy size={14} />}
                {copiedNum ? 'Copiado!' : 'Copiar número'}
              </button>
            </div>

            <button
              onClick={() => {
                setSuccessData(null);
                setView('painel');
              }}
              className="btn-primary w-full"
            >
              Ver no Painel
            </button>
          </div>
        </div>
      )}

      {/* ========== ENTREGA MODAL ========== */}
      {showEntrega && (
        <div className="modal-overlay" onClick={() => setShowEntrega(null)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl font-bold">Adicionar Entrega</h2>
              <button onClick={() => setShowEntrega(null)} className="btn-ghost p-2">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddEntrega} data-testid="form-entrega">
              <div className="mb-4">
                <label className="label">Links (separados por vírgula)</label>
                <input
                  type="text"
                  placeholder="https://drive.google.com/..."
                  value={entregaLinks}
                  onChange={(e) => setEntregaLinks(e.target.value)}
                  className="input-field"
                  data-testid="input-entrega-links"
                />
              </div>

              <div className="mb-6">
                <label className="label">Arquivos</label>
                <label className="file-upload block cursor-pointer">
                  <Upload className="mx-auto mb-2 text-gray-400" size={24} />
                  <p className="text-gray-500 text-sm">
                    {entregaFiles.length > 0 
                      ? `${entregaFiles.length} arquivo(s)` 
                      : 'Imagens, PDFs, vídeos...'}
                  </p>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setEntregaFiles(Array.from(e.target.files))}
                    className="hidden"
                    data-testid="input-entrega-files"
                  />
                </label>
              </div>

              <button type="submit" className="btn-primary w-full" data-testid="btn-submit-entrega">
                Salvar Entrega
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========== DETALHES MODAL ========== */}
      {showDetalhes && (
        <div className="modal-overlay" onClick={() => setShowDetalhes(null)}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl font-bold">{showDetalhes.numero}</h2>
              <button onClick={() => setShowDetalhes(null)} className="btn-ghost p-2">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Solicitante</p>
                <p className="text-lg">{showDetalhes.solicitante}</p>
              </div>
              
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Status</p>
                <span className={`inline-block px-3 py-1 text-sm font-medium border ${STATUS_COLORS[showDetalhes.status]}`}>
                  {showDetalhes.status}
                </span>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Demanda</p>
                <p className="text-gray-800 whitespace-pre-wrap">{showDetalhes.demanda}</p>
              </div>

              {showDetalhes.referencias && showDetalhes.referencias.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Referências</p>
                  <div className="space-y-2">
                    {showDetalhes.referencias.map((ref, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {ref.type === 'link' ? (
                          <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                            <ExternalLink size={14} /> {ref.url}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Paperclip size={14} /> {ref.filename}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showDetalhes.entregas && showDetalhes.entregas.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Entregas</p>
                  <div className="space-y-2">
                    {showDetalhes.entregas.map((entrega, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {entrega.type === 'link' ? (
                          <a href={entrega.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                            <ExternalLink size={14} /> {entrega.url}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Paperclip size={14} /> {entrega.filename}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t flex gap-3">
              <button
                onClick={() => handleCopyWhatsApp(showDetalhes)}
                className="btn-secondary flex-1"
              >
                <MessageCircle size={16} className="inline mr-2" />
                Copiar WhatsApp
              </button>
              <button
                onClick={() => {
                  setShowEntrega(showDetalhes.id);
                  setShowDetalhes(null);
                }}
                className="btn-primary flex-1"
              >
                <Paperclip size={16} className="inline mr-2" />
                Adicionar Entrega
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
