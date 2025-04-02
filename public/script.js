document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    form: document.getElementById('urlForm'),
    processBtn: document.getElementById('processBtn'),
    confirmBtn: document.getElementById('confirmBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    downloadBtn: document.getElementById('downloadAllBtn'),
    csvBtn: document.getElementById('addCsvBtn'),
    csvInput: document.getElementById('csvFile'),
    confirmation: document.getElementById('confirmation'),
    results: document.getElementById('results'),
    urlCount: document.getElementById('urlCount'),
    urlList: document.getElementById('urlList'),
    resultList: document.getElementById('resultList')
  };

  let state = {
    urls: [],
    sessionId: null
  };

  // Form submission
  elements.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoading(elements.processBtn, true);
    
    try {
      const formData = new FormData(elements.form);
      const response = await fetch('/process', { method: 'POST', body: formData });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process URLs');
      }
      
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      if (!data.urls || data.urls.length === 0) {
        throw new Error('No valid URLs found');
      }
      
      state.urls = data.urls;
      elements.urlCount.textContent = data.count;
      elements.urlList.innerHTML = data.urls.map(url => 
        `<li>${url}</li>`).join('');
      
      elements.form.classList.add('hidden');
      elements.confirmation.classList.remove('hidden');
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      toggleLoading(elements.processBtn, false);
    }
  });

  // Confirm capture
  elements.confirmBtn.addEventListener('click', async () => {
    toggleLoading(elements.confirmBtn, true);
    
    try {
      if (!state.urls || state.urls.length === 0) {
        throw new Error('No URLs to capture');
      }
      
      const response = await fetch('/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: state.urls })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to capture screenshots');
      }
      
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      state.sessionId = data.sessionId;
      displayResults(data.results);
      elements.confirmation.classList.add('hidden');
      elements.results.classList.remove('hidden');
    } catch (error) {
      alert(`Capture failed: ${error.message}`);
    } finally {
      toggleLoading(elements.confirmBtn, false);
    }
  });

  // Cancel action
  elements.cancelBtn.addEventListener('click', () => {
    elements.confirmation.classList.add('hidden');
    elements.form.classList.remove('hidden');
  });

  // Download all
  elements.downloadBtn.addEventListener('click', () => {
    if (!state.sessionId) return alert('No screenshots available');
    window.location.href = `/download/${state.sessionId}`;
  });

  // CSV upload
  elements.csvBtn.addEventListener('click', () => elements.csvInput.click());
  elements.csvInput.addEventListener('change', () => {
    if (elements.csvInput.files.length) {
      elements.csvBtn.textContent = elements.csvInput.files[0].name;
    }
  });

  // Helper functions
  function toggleLoading(button, isLoading) {
    button.disabled = isLoading;
    button.innerHTML = isLoading ? 
      '<div class="spinner"></div>' : 
      button === elements.processBtn ? 'Process URLs' : 'Confirm & Capture';
  }

  function displayResults(results) {
    elements.resultList.innerHTML = results.map(result => `
      <div class="result-item ${result.success ? 'success' : 'error'}">
        <p><strong>${result.url}</strong></p>
        <p>${result.success ? 
          `Saved as: ${result.filename}` : 
          `<span class="error-text">Error: ${result.error}</span>`}
        </p>
      </div>
    `).join('');
  }
});