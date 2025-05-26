// Exemplo de upload do frontend para R2
// Este código deve ser usado no frontend (React, Vue, etc)

// ============================================
// UPLOAD SIMPLES (Foto de Perfil)
// ============================================
async function uploadProfilePicture(file) {
  try {
    // 1. Obter URL pré-assinada do backend
    const response = await fetch('/api/media/profile-picture/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // ou enviar via cookie
      },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      })
    });

    const { dados } = await response.json();
    const { uploadUrl, key } = dados;

    // 2. Upload direto para R2
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });

    if (!uploadResponse.ok) {
      throw new Error('Falha no upload para R2');
    }

    // 3. Confirmar upload no backend
    const confirmResponse = await fetch('/api/media/profile-picture/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ key })
    });

    const confirmData = await confirmResponse.json();
    console.log('Upload concluído!', confirmData);
    
    return confirmData.dados;
  } catch (error) {
    console.error('Erro no upload:', error);
    throw error;
  }
}

// ============================================
// UPLOAD MULTIPART (Arquivos Grandes > 100MB)
// ============================================
async function uploadLargeFile(file) {
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB por parte
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  
  try {
    // 1. Iniciar upload multipart
    const initResponse = await fetch('/api/media/multipart/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type
      })
    });

    const { dados: { uploadId, key } } = await initResponse.json();
    console.log(`Upload multipart iniciado: ${uploadId}`);

    // 2. Upload de cada parte
    const parts = [];
    
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      // Obter URL para esta parte
      const partUrlResponse = await fetch('/api/media/multipart/part-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          key,
          uploadId,
          partNumber
        })
      });

      const { dados: { uploadUrl } } = await partUrlResponse.json();

      // Upload da parte para R2
      const partUploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: chunk
      });

      if (!partUploadResponse.ok) {
        throw new Error(`Falha no upload da parte ${partNumber}`);
      }

      // Obter ETag do header da resposta
      const etag = partUploadResponse.headers.get('ETag');
      parts.push({
        ETag: etag,
        PartNumber: partNumber
      });

      // Progresso
      const progress = (partNumber / totalParts) * 100;
      console.log(`Progresso: ${progress.toFixed(2)}%`);
    }

    // 3. Completar upload
    const completeResponse = await fetch('/api/media/multipart/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        key,
        uploadId,
        parts
      })
    });

    const completeData = await completeResponse.json();
    console.log('Upload multipart concluído!', completeData);
    
    return completeData.dados;
  } catch (error) {
    console.error('Erro no upload multipart:', error);
    
    // Em caso de erro, poderia abortar o upload
    // await fetch('/api/media/multipart/abort', { ... });
    
    throw error;
  }
}

// ============================================
// EXEMPLO DE USO COM PROGRESS BAR
// ============================================
function UploadComponent() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    
    try {
      if (file.size > 100 * 1024 * 1024) { // > 100MB
        await uploadLargeFileWithProgress(file, setProgress);
      } else {
        await uploadProfilePicture(file);
        setProgress(100);
      }
      
      alert('Upload concluído com sucesso!');
    } catch (error) {
      alert('Erro no upload: ' + error.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div>
      <input 
        type="file" 
        onChange={handleFileSelect}
        accept="image/*"
        disabled={uploading}
      />
      
      {uploading && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
          <span>{progress.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

// ============================================
// LISTAR E BAIXAR ARQUIVOS (ADMIN)
// ============================================
async function listFiles(prefix = '') {
  const response = await fetch(`/api/media/list?prefix=${prefix}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const { dados } = await response.json();
  return dados.files;
}

async function downloadFile(key) {
  // Obter URL pré-assinada
  const response = await fetch('/api/media/download-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ key })
  });

  const { dados: { downloadUrl } } = await response.json();

  // Download do arquivo
  window.open(downloadUrl, '_blank');
}

// ============================================
// DELETAR ARQUIVO
// ============================================
async function deleteFile(key) {
  if (!confirm('Tem certeza que deseja deletar este arquivo?')) {
    return;
  }

  const response = await fetch('/api/media/delete', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ key })
  });

  if (response.ok) {
    console.log('Arquivo deletado com sucesso');
  }
}
