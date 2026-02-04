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
  Calendar,
  User,
  FileCheck
} from 'lucide-react';
import './App.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const formatCurrentDate = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
};

const getMonthYearPt = (dateStr) => {
  const months = {
    '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
    '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
    '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
  };
  try {
    const parts = dateStr.split('/');
    return `${months[parts[1]]} / ${parts[2]}`;
  } catch {
    return dateStr;
  }
};

function App() {
  const [reports, setReports] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [previewReport, setPreviewReport] = useState(null);
  
  const [formData, setFormData] = useState({
    demanda: '',
    solicitacao: '',
    data: formatCurrentDate(),
    image: null,
    imagePreview: null,
    existingImage: null
  });

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = searchQuery 
        ? `${API_URL}/api/reports?search=${encodeURIComponent(searchQuery)}`
        : `${API_URL}/api/reports`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao carregar relatórios');
      const data = await res.json();
      setReports(data);
    } catch (error) {
      toast.error('Erro ao carregar relatórios');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const resetForm = () => {
    setFormData({
      demanda: '',
      solicitacao: '',
      data: formatCurrentDate(),
      image: null,
      imagePreview: null,
      existingImage: null
    });
    setEditingReport(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = async (report) => {
    try {
      const res = await fetch(`${API_URL}/api/reports/${report.id}`);
      if (!res.ok) throw new Error('Erro ao carregar relatório');
      const data = await res.json();
      
      setFormData({
        demanda: data.demanda,
        solicitacao: data.solicitacao,
        data: data.data,
        image: null,
        imagePreview: null,
        existingImage: data.image_data ? `data:image/png;base64,${data.image_data}` : null
      });
      setEditingReport(report);
      setShowForm(true);
    } catch (error) {
      toast.error('Erro ao carregar relatório');
    }
  };

  const openPreview = async (report) => {
    try {
      const res = await fetch(`${API_URL}/api/reports/${report.id}`);
      if (!res.ok) throw new Error('Erro ao carregar relatório');
      const data = await res.json();
      setPreviewReport(data);
      setShowPreview(true);
    } catch (error) {
      toast.error('Erro ao carregar prévia');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.demanda.trim() || !formData.solicitacao.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const submitData = new FormData();
    submitData.append('demanda', formData.demanda);
    submitData.append('solicitacao', formData.solicitacao);
    submitData.append('data', formData.data);
    
    if (formData.image) {
      submitData.append('image', formData.image);
    }
    
    if (editingReport && !formData.image && !formData.existingImage) {
      submitData.append('remove_image', 'true');
    }

    try {
      const url = editingReport 
        ? `${API_URL}/api/reports/${editingReport.id}`
        : `${API_URL}/api/reports`;
      
      const res = await fetch(url, {
        method: editingReport ? 'PUT' : 'POST',
        body: submitData
      });

      if (!res.ok) throw new Error('Erro ao salvar relatório');
      
      toast.success(editingReport ? 'Relatório atualizado!' : 'Relatório criado!');
      setShowForm(false);
      resetForm();
      fetchReports();
    } catch (error) {
      toast.error('Erro ao salvar relatório');
    }
  };

  const handleDelete = async (reportId) => {
    if (!window.confirm('Tem certeza que deseja excluir este relatório?')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/reports/${reportId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Erro ao excluir relatório');
      toast.success('Relatório excluído!');
      fetchReports();
    } catch (error) {
      toast.error('Erro ao excluir relatório');
    }
  };

  const handleDownloadPDF = async (reportId) => {
    try {
      const res = await fetch(`${API_URL}/api/reports/${reportId}/pdf`);
      if (!res.ok) throw new Error('Erro ao gerar PDF');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('PDF baixado!');
    } catch (error) {
      toast.error('Erro ao gerar PDF');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        image: file,
        imagePreview: URL.createObjectURL(file),
        existingImage: null
      }));
    }
  };

  const removeImage = () => {
    setFormData(prev => ({
      ...prev,
      image: null,
      imagePreview: null,
      existingImage: null
    }));
  };

  return (
    <div className="min-h-screen bg-surface">
      <Toaster position="top-right" toastOptions={{ className: 'border border-black' }} />
      
      {/* Header */}
      <header className="bg-white border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-heading text-2xl font-bold text-black" data-testid="app-title">
                Relatórios de Produção
              </h1>
              <p className="text-sm text-gray-500 mt-1 font-body">
                Assessoria de Comunicação • Prefeitura de Canaã dos Carajás
              </p>
            </div>
            <button
              onClick={openCreateForm}
              className="btn-primary flex items-center gap-2"
              data-testid="btn-new-report"
            >
              <Plus size={18} />
              Novo Relatório
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-0 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por data ou solicitante..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-8"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : reports.length === 0 ? (
          <div className="card text-center py-12" data-testid="empty-state">
            <FileText className="mx-auto mb-4 text-gray-300" size={48} />
            <p className="text-gray-500">Nenhum relatório encontrado</p>
            <button
              onClick={openCreateForm}
              className="btn-secondary mt-4"
            >
              Criar primeiro relatório
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report, index) => (
              <div 
                key={report.id} 
                className="card animate-fadeIn"
                style={{ animationDelay: `${index * 50}ms` }}
                data-testid={`report-card-${report.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-3">
                      <span className="font-mono text-sm bg-gray-100 px-3 py-1 border border-gray-200">
                        <Calendar size={14} className="inline mr-2" />
                        {report.data}
                      </span>
                      <span className="font-mono text-sm bg-gray-100 px-3 py-1 border border-gray-200">
                        <User size={14} className="inline mr-2" />
                        {report.solicitacao}
                      </span>
                      {report.has_image && (
                        <span className="font-mono text-xs bg-black text-white px-2 py-1">
                          COM ANEXO
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 line-clamp-2">{report.demanda}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => openPreview(report)}
                      className="btn-ghost p-2"
                      title="Visualizar"
                      data-testid={`btn-preview-${report.id}`}
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => openEditForm(report)}
                      className="btn-ghost p-2"
                      title="Editar"
                      data-testid={`btn-edit-${report.id}`}
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(report.id)}
                      className="btn-ghost p-2"
                      title="Baixar PDF"
                      data-testid={`btn-download-${report.id}`}
                    >
                      <Download size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="btn-ghost p-2 hover:text-red-600"
                      title="Excluir"
                      data-testid={`btn-delete-${report.id}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl font-bold">
                {editingReport ? 'Editar Relatório' : 'Novo Relatório'}
              </h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} data-testid="report-form">
              <div className="space-y-6">
                <div>
                  <label className="label">Data</label>
                  <input
                    type="text"
                    value={formData.data}
                    onChange={(e) => setFormData(prev => ({ ...prev, data: e.target.value }))}
                    className="input-field font-mono"
                    data-testid="input-data"
                  />
                </div>

                <div>
                  <label className="label">Solicitação *</label>
                  <input
                    type="text"
                    value={formData.solicitacao}
                    onChange={(e) => setFormData(prev => ({ ...prev, solicitacao: e.target.value }))}
                    placeholder="Nome de quem solicitou o material"
                    className="input-field"
                    data-testid="input-solicitacao"
                  />
                </div>

                <div>
                  <label className="label">Demanda *</label>
                  <textarea
                    value={formData.demanda}
                    onChange={(e) => setFormData(prev => ({ ...prev, demanda: e.target.value }))}
                    placeholder="Descrição da tarefa realizada"
                    rows={5}
                    className="textarea-field"
                    data-testid="input-demanda"
                  />
                </div>

                <div>
                  <label className="label">Anexo (Printscreen)</label>
                  {(formData.imagePreview || formData.existingImage) ? (
                    <div className="file-upload has-file">
                      <img 
                        src={formData.imagePreview || formData.existingImage} 
                        alt="Preview" 
                        className="max-h-48 mx-auto mb-4"
                      />
                      <button 
                        type="button" 
                        onClick={removeImage}
                        className="btn-secondary text-xs"
                      >
                        Remover Imagem
                      </button>
                    </div>
                  ) : (
                    <label className="file-upload block cursor-pointer">
                      <Upload className="mx-auto mb-2 text-gray-400" size={32} />
                      <p className="text-gray-500 text-sm">Clique para anexar imagem</p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        data-testid="input-image"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button type="submit" className="btn-primary flex-1" data-testid="btn-submit">
                  <FileCheck size={18} className="inline mr-2" />
                  {editingReport ? 'Salvar Alterações' : 'Criar Relatório'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)} 
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewReport && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal-content max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl font-bold">Prévia do Relatório</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDownloadPDF(previewReport.id)}
                  className="btn-primary text-xs px-4 py-2"
                  data-testid="btn-preview-download"
                >
                  <Download size={16} className="inline mr-2" />
                  Baixar PDF
                </button>
                <button onClick={() => setShowPreview(false)} className="btn-ghost p-2">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="preview-container" data-testid="report-preview">
              <div className="preview-header">
                <h3 className="text-xl font-bold mb-2">
                  Relatório de Produção de: {getMonthYearPt(previewReport.data)}
                </h3>
                <p className="text-sm mb-4">Data: {previewReport.data}</p>
                <div className="text-sm space-y-1">
                  <p><strong>Nome:</strong> Gustavo Ferreira Santos</p>
                  <p><strong>Cargo:</strong> Assessor Especial 3</p>
                  <p><strong>Secretária:</strong> Sheila Cristina</p>
                  <p>Prefeitura Municipal de Canaã dos Carajás</p>
                </div>
              </div>

              <div className="preview-section">
                <h4 className="preview-section-title">DEMANDA</h4>
                <p className="whitespace-pre-wrap">{previewReport.demanda}</p>
              </div>

              <div className="preview-section">
                <h4 className="preview-section-title">SOLICITAÇÃO</h4>
                <p>{previewReport.solicitacao}</p>
              </div>

              {previewReport.image_data && (
                <div className="preview-section">
                  <h4 className="preview-section-title">ANEXO (PRINTSCREEN)</h4>
                  <img 
                    src={`data:image/png;base64,${previewReport.image_data}`} 
                    alt="Anexo" 
                    className="max-w-full mx-auto border border-gray-300"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
