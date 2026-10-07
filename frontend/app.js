"use strict";

var APP_ID = "life-toolbox";
var API_ROOT = "/v2/proxy/" + APP_ID;

function byId(id) {
  return document.getElementById(id);
}

function numberValue(id) {
  var value = Number.parseFloat(byId(id).value);
  return Number.isFinite(value) ? value : null;
}

function showResult(id, text) {
  byId(id).textContent = text;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2
  }).format(Number(value));
}

function getCookie(name) {
  var prefix = encodeURIComponent(name) + "=";
  var items = document.cookie.split(";");
  for (var i = 0; i < items.length; i += 1) {
    var item = items[i].trim();
    if (item.indexOf(prefix) === 0) {
      return item.slice(prefix.length);
    }
  }
  return "";
}

function platformHeaders() {
  var session = getCookie("TMSESSNAME");
  var csrf = getCookie("X-Csrf-Token");
  return {
    "Content-Type": "application/json",
    "X-Csrf-Token": csrf,
    "Cookie": "TMSESSNAME=" + session + "; X-Csrf-Token=" + csrf + ";"
  };
}

async function apiRequest(endpoint, payload) {
  var response = await fetch(API_ROOT + "/" + endpoint, {
    method: payload ? "POST" : "GET",
    credentials: "include",
    headers: platformHeaders(),
    body: payload ? JSON.stringify(payload) : undefined
  });
  var data = await response.json().catch(function () {
    return { ok: false, error: "服务返回了无法解析的数据" };
  });
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "请求失败，状态码 " + response.status);
  }
  return data;
}

function setBackendState(state, text) {
  var badge = byId("backendBadge");
  badge.className = "status-badge status-" + state;
  byId("backendBadgeText").textContent = text;
}

async function checkBackend() {
  setBackendState("checking", "检查服务");
  try {
    var data = await apiRequest("health");
    setBackendState("online", "Python " + data.python);
  } catch (error) {
    setBackendState("offline", "后端不可用");
  }
}

function activateTab(button) {
  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".tool-panel");
  tabs.forEach(function (tab) {
    tab.classList.toggle("is-active", tab === button);
  });
  panels.forEach(function (panel) {
    panel.classList.toggle("is-active", panel.id === button.dataset.tab);
  });
}

var operations = {
  date: async function () {
    var data = await apiRequest("calculate", {
      operation: "date",
      start: byId("dateStart").value,
      end: byId("dateEnd").value
    });
    showResult(
      "dateResult",
      "相差 " + data.result.absolute_days + " 天\n方向：" +
        (data.result.direction === "forward" ? "向后" : "向前")
    );
  },

  unit: async function () {
    var data = await apiRequest("calculate", {
      operation: "unit",
      value: numberValue("unitValue"),
      from_unit: byId("unitFrom").value,
      to_unit: byId("unitTo").value
    });
    showResult(
      "unitResult",
      formatNumber(byId("unitValue").value) + " " + data.result.from + " = " +
        formatNumber(data.result.value) + " " + data.result.to
    );
  },

  bmi: async function () {
    var labels = {
      underweight: "偏轻",
      normal: "正常范围",
      overweight: "偏重",
      obesity: "肥胖范围"
    };
    var data = await apiRequest("calculate", {
      operation: "bmi",
      height_cm: numberValue("heightCm"),
      weight_kg: numberValue("weightKg")
    });
    showResult("bmiResult", "BMI：" + formatNumber(data.result.bmi) + "\n分类：" + labels[data.result.category]);
  },

  discount: async function () {
    var data = await apiRequest("calculate", {
      operation: "discount",
      original_price: numberValue("originalPrice"),
      discount_percent: numberValue("discountPercent"),
      tax_percent: numberValue("taxPercent")
    });
    showResult(
      "discountResult",
      "折后价：" + formatNumber(data.result.discounted_price) +
        "\n优惠：" + formatNumber(data.result.saved) +
        "\n税额：" + formatNumber(data.result.tax) +
        "\n最终价格：" + formatNumber(data.result.total)
    );
  },

  tip: async function () {
    var data = await apiRequest("calculate", {
      operation: "tip",
      bill: numberValue("tipBill"),
      tip_percent: numberValue("tipPercent"),
      people: numberValue("tipPeople")
    });
    showResult(
      "tipResult",
      "含小费总额：" + formatNumber(data.result.total) +
        "\n小费：" + formatNumber(data.result.tip) +
        "\n每人支付：" + formatNumber(data.result.per_person)
    );
  },

  fuel: async function () {
    var data = await apiRequest("calculate", {
      operation: "fuel",
      distance_km: numberValue("fuelDistance"),
      liters_per_100km: numberValue("fuelConsumption"),
      price_per_liter: numberValue("fuelPrice")
    });
    showResult(
      "fuelResult",
      "预计耗油：" + formatNumber(data.result.liters) + " L\n预计费用：" + formatNumber(data.result.cost)
    );
  },

  loan: async function () {
    var data = await apiRequest("calculate", {
      operation: "loan",
      principal: numberValue("loanPrincipal"),
      annual_rate_percent: numberValue("loanRate"),
      years: numberValue("loanYears")
    });
    showResult(
      "loanResult",
      "月供：" + formatNumber(data.result.monthly_payment) +
        "\n总还款：" + formatNumber(data.result.total_payment) +
        "\n总利息：" + formatNumber(data.result.total_interest)
    );
  },

  picker: async function () {
    var items = byId("pickerItems").value.split(/\r?\n/);
    var data = await apiRequest("pick", { items: items });
    showResult("pickerResult", "选中：" + data.picked);
  },

  password: async function () {
    var data = await apiRequest("password", {
      length: numberValue("passwordLength"),
      mode: byId("passwordMode").value
    });
    showResult("passwordResult", data.password);
  }
};

function bindEvents() {
  document.querySelectorAll(".tab").forEach(function (button) {
    button.addEventListener("click", function () {
      activateTab(button);
    });
  });

  document.querySelectorAll("[data-operation]").forEach(function (button) {
    button.addEventListener("click", async function () {
      var key = button.dataset.operation;
      var resultId = {
        date: "dateResult",
        unit: "unitResult",
        bmi: "bmiResult",
        discount: "discountResult",
        tip: "tipResult",
        fuel: "fuelResult",
        loan: "loanResult",
        picker: "pickerResult",
        password: "passwordResult"
      }[key];

      button.disabled = true;
      showResult(resultId, "计算中 ...");
      try {
        await operations[key]();
        setBackendState("online", "服务正常");
      } catch (error) {
        showResult(resultId, "错误：" + error.message);
        setBackendState("offline", "计算失败");
      } finally {
        button.disabled = false;
      }
    });
  });

  byId("checkBackend").addEventListener("click", checkBackend);
}

document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  checkBackend();
});
