document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".js-confirm-delete").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (!window.confirm("Delete this record? This cannot be undone.")) {
        event.preventDefault();
      }
    });
  });
});
