document.addEventListener('DOMContentLoaded', () => {
  // Tab switching logic for real CLI terminal examples
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      // Update button states
      tabButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Update pane states
      tabPanes.forEach((pane) => {
        if (pane.id === targetId) {
          pane.classList.add('active');
          pane.hidden = false;
        } else {
          pane.classList.remove('active');
          pane.hidden = true;
        }
      });
    });
  });

  // Copy to clipboard helper for install snippet
  const copyBtns = document.querySelectorAll('.copy-btn');
  copyBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetSelector = btn.getAttribute('data-copy-target');
      const targetEl = document.querySelector(targetSelector);
      if (targetEl) {
        try {
          await navigator.clipboard.writeText(targetEl.innerText.trim());
          const originalText = btn.innerText;
          btn.innerText = 'Copied!';
          setTimeout(() => {
            btn.innerText = originalText;
          }, 2000);
        } catch {
          // Clipboard write failed or unpermitted
        }
      }
    });
  });
});
