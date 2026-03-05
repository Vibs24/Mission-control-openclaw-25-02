(function () {
  const navToggle = document.getElementById("navToggle");
  const mainNav = document.getElementById("mainNav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      const open = mainNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  const saleTable = document.getElementById("saleItemsTable");
  const addItemLine = document.getElementById("addItemLine");
  const branchSelect = document.getElementById("branchSelect");

  function filterOptionsByBranch() {
    if (!saleTable || !branchSelect) {
      return;
    }
    const branchId = branchSelect.value;
    saleTable.querySelectorAll("select[name='product_id'] option[data-branch]").forEach(function (opt) {
      if (!branchId || opt.dataset.branch === branchId) {
        opt.hidden = false;
      } else {
        opt.hidden = true;
      }
    });

    const customerSelect = document.querySelector("select[name='customer_id']");
    if (customerSelect) {
      customerSelect.querySelectorAll("option[data-branch]").forEach(function (opt) {
        if (!branchId || opt.dataset.branch === branchId) {
          opt.hidden = false;
        } else {
          opt.hidden = true;
        }
      });
    }
  }

  if (saleTable) {
    saleTable.addEventListener("click", function (event) {
      if (!event.target.classList.contains("remove-row")) {
        return;
      }
      const rows = saleTable.querySelectorAll("tbody tr");
      if (rows.length <= 1) {
        return;
      }
      event.target.closest("tr").remove();
    });
  }

  if (addItemLine && saleTable) {
    addItemLine.addEventListener("click", function () {
      const first = saleTable.querySelector("tbody tr");
      if (!first) {
        return;
      }
      const clone = first.cloneNode(true);
      clone.querySelectorAll("input, select").forEach(function (el) {
        if (el.tagName === "SELECT") {
          el.selectedIndex = 0;
        } else {
          el.value = "";
        }
      });
      saleTable.querySelector("tbody").appendChild(clone);
      filterOptionsByBranch();
    });
  }

  if (branchSelect) {
    branchSelect.addEventListener("change", filterOptionsByBranch);
    filterOptionsByBranch();
  }
})();
