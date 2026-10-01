(() => {
  "use strict";

  const config = window.RECIPE_APP_CONFIG || {};
  const STORAGE_KEY = "tam-family-recipes-v2";
  const FAVORITES_KEY = "tam-family-favorites-v2";

  const seedRecipe = {
    id: "wonton-soup",
    title: "Wonton Soup",
    description: "A comforting bowl of pork-and-mushroom wontons, noodles, greens, and a simple ginger chicken broth.",
    cover: "assets/wonton-soup.webp",
    stepPhotos: [],
    prepTime: "35 min",
    cookTime: "45 min",
    servings: 6,
    category: "Soups & stews",
    tags: ["comfort food", "noodles", "family favorite"],
    contributor: "Tam family",
    story: "This recipe was written down from the version the family knows by feel. Keep tasting the broth as it simmers, and fold the wontons together around the table when you can.",
    notes: "The chicken thigh meat can be saved for another recipe. Boil the wontons and noodles separately so the broth stays clear.",
    ingredients: [
      { name: "For the wontons", items: [
        { quantity: "1", unit: "lb", name: "ground pork" },
        { quantity: "5", unit: "", name: "shiitake mushrooms, finely chopped" },
        { quantity: "3", unit: "", name: "green onions, finely chopped" },
        { quantity: "1", unit: "tsp", name: "salt" },
        { quantity: "1/2", unit: "tsp", name: "white pepper" },
        { quantity: "2", unit: "tbsp", name: "soy sauce" },
        { quantity: "1", unit: "tbsp", name: "sesame oil" },
        { quantity: "2", unit: "packs", name: "wonton wrappers" }
      ]},
      { name: "For the soup broth", items: [
        { quantity: "4", unit: "", name: "chicken thigh bones, meat removed" },
        { quantity: "4", unit: "large slices", name: "fresh ginger" },
        { quantity: "", unit: "", name: "white pepper, to taste" },
        { quantity: "", unit: "", name: "salt, to taste" },
        { quantity: "1", unit: "tbsp", name: "soy sauce, plus more to taste" },
        { quantity: "1", unit: "tsp", name: "sesame oil" }
      ]},
      { name: "To finish", items: [
        { quantity: "12", unit: "oz", name: "noodles" },
        { quantity: "3", unit: "heads", name: "bok choy or other vegetables" }
      ]}
    ],
    directions: [
      "Start the soup base first. Fill a large pot three-quarters full with water, then add the chicken bones, ginger, white pepper, salt, soy sauce, and sesame oil.",
      "Bring the broth to a boil, lower the heat, and let it simmer while you prepare the wontons.",
      "Finely chop the mushrooms and green onions. Mix them thoroughly with the ground pork, salt, white pepper, soy sauce, and sesame oil.",
      "Place a small spoonful of filling in each wonton wrapper. Moisten the edges, fold, and seal securely.",
      "Add the bok choy or other vegetables to the soup broth and cook until just tender.",
      "In separate pots of boiling water, cook the noodles and wontons until done. The wontons should float and the pork should be fully cooked.",
      "Divide the noodles and wontons among bowls. Ladle over the hot broth and vegetables, then enjoy."
    ],
    comments: [],
    views: 124,
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z"
  };

  class LocalRecipeStore {
    async init() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) localStorage.setItem(STORAGE_KEY, JSON.stringify([seedRecipe]));
    }
    async list() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    async save(recipe) {
      const recipes = await this.list();
      const index = recipes.findIndex(item => item.id === recipe.id);
      if (index >= 0) recipes[index] = recipe; else recipes.unshift(recipe);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
      return recipe;
    }
    async remove(id) {
      const recipes = (await this.list()).filter(item => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
    }
  }

  class SupabaseRecipeStore {
    constructor(client) { this.client = client; }
    async init() {
      const { data, error } = await this.client.from("recipes").select("id").limit(1);
      if (error) throw error;
      if (!data.length) await this.save(seedRecipe, true);
    }
    async list() {
      const { data, error } = await this.client.from("recipes").select("payload").order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(row => row.payload);
    }
    async requireUser() {
      const { data } = await this.client.auth.getSession();
      if (!data.session) throw new Error("Family sign-in is required before changing shared recipes.");
    }
    async save(recipe, seed = false) {
      if (!seed) await this.requireUser();
      const { error } = await this.client.from("recipes").upsert({ id: recipe.id, payload: recipe, updated_at: new Date().toISOString() });
      if (error) throw error;
      return recipe;
    }
    async remove(id) {
      await this.requireUser();
      const { error } = await this.client.from("recipes").delete().eq("id", id);
      if (error) throw error;
    }
  }

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escapeHTML = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const slugify = value => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `recipe-${Date.now()}`;
  const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const formatDate = value => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

  const state = {
    recipes: [], favorites: new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")),
    store: null, activeView: "home", activeRecipeId: null, editorTab: "basics",
    currentCover: "", currentStepPhotos: [], filterTag: ""
  };

  function toast(message) {
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    $("#toastRegion").append(item);
    setTimeout(() => item.remove(), 3200);
  }

  async function setupStore() {
    const wantsSupabase = config.USE_SUPABASE && !String(config.SUPABASE_URL).startsWith("[") && window.supabase;
    if (wantsSupabase) {
      const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
      state.store = new SupabaseRecipeStore(client);
      try {
        await state.store.init();
        $("#modeBadge").innerHTML = '<span aria-hidden="true"></span> Shared database';
        $("#modeBadge").classList.add("online");
      } catch (error) {
        console.error(error);
        state.store = new LocalRecipeStore();
        await state.store.init();
        toast("Shared database unavailable. Using local demo mode.");
      }
    } else {
      state.store = new LocalRecipeStore();
      await state.store.init();
    }
    state.recipes = await state.store.list();
  }

  function recipeCard(recipe) {
    const favorite = state.favorites.has(recipe.id);
    const cover = recipe.cover || "assets/wonton-soup.webp";
    return `<article class="recipe-card">
      <div class="recipe-card-image"><img src="${escapeHTML(cover)}" alt="${escapeHTML(recipe.title)} cover photo"><button class="favorite-button" type="button" data-favorite-id="${escapeHTML(recipe.id)}" aria-label="${favorite ? "Remove" : "Add"} ${escapeHTML(recipe.title)} ${favorite ? "from" : "to"} favorites" aria-pressed="${favorite}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20S4 15.6 4 9.4C4 6.4 5.9 5 8.2 5c1.7 0 3 1 3.8 2.2C12.8 6 14.1 5 15.8 5 18.1 5 20 6.4 20 9.4 20 15.6 12 20 12 20Z"/></svg></button></div>
      <div class="recipe-card-body"><div class="recipe-card-meta"><span>${escapeHTML(recipe.category || "Uncategorized")}</span><span>${escapeHTML(recipe.prepTime || "Family recipe")}</span></div><h3><button type="button" data-open-recipe="${escapeHTML(recipe.id)}">${escapeHTML(recipe.title)}</button></h3><p>${escapeHTML(recipe.description || "A recipe from the family collection.")}</p><div class="card-footer"><span>By ${escapeHTML(recipe.contributor || "the family")}</span><button type="button" data-open-recipe="${escapeHTML(recipe.id)}">View recipe →</button></div></div>
    </article>`;
  }

  function addRecipeCard() {
    return `<button class="recipe-card add-recipe-card" type="button" data-action="add-recipe"><span><span class="plus">+</span><h3>Add the next family favorite</h3><p>Photos, ingredients, story and all.</p></span></button>`;
  }

  function renderHome() {
    const popular = [...state.recipes].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 2);
    const featured = popular[0];
    if (featured) {
      const favorite = state.favorites.has(featured.id);
      $("#featuredRecipe").hidden = false;
      $("#featuredRecipe").innerHTML = `<div class="featured-photo"><img src="${escapeHTML(featured.cover || "assets/wonton-soup.webp")}" alt="${escapeHTML(featured.title)} cover photo"><span class="photo-label">Most loved</span><button class="favorite-button light" type="button" data-favorite-id="${escapeHTML(featured.id)}" aria-label="${favorite ? "Remove from" : "Add to"} favorites" aria-pressed="${favorite}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20S4 15.6 4 9.4C4 6.4 5.9 5 8.2 5c1.7 0 3 1 3.8 2.2C12.8 6 14.1 5 15.8 5 18.1 5 20 6.4 20 9.4 20 15.6 12 20 12 20Z"/></svg></button></div><div class="featured-copy"><p class="eyebrow">From the family table</p><h2>${escapeHTML(featured.title)}</h2><p>${escapeHTML(featured.description || "A recipe from the family collection.")}</p><dl class="quick-facts"><div><dt>Prep</dt><dd>${escapeHTML(featured.prepTime || "—")}</dd></div><div><dt>Cook</dt><dd>${escapeHTML(featured.cookTime || "—")}</dd></div><div><dt>Serves</dt><dd>${escapeHTML(featured.servings || "—")}</dd></div></dl><div class="featured-actions"><button class="button button-cream" type="button" data-open-recipe="${escapeHTML(featured.id)}">Cook this recipe <span aria-hidden="true">→</span></button><span class="hand-note" aria-hidden="true">Perfect for sharing!</span></div></div>`;
    } else {
      $("#featuredRecipe").hidden = true;
    }
    $("#popularGrid").innerHTML = popular.map(recipeCard).join("") + addRecipeCard();
    const categories = categoryCounts();
    const fallback = ["Soups & stews", "Main dishes", "Side dishes", "Desserts"];
    const names = unique([...Object.keys(categories), ...fallback]).slice(0, 4);
    const icons = ["♨", "🍚", "🥬", "🥧"];
    $("#homeCategoryGrid").innerHTML = names.map((name, index) => `<button class="category-card" type="button" data-category-link="${escapeHTML(name)}" data-icon="${icons[index]}"><strong>${escapeHTML(name)}<span>${categories[name] || 0} recipe${categories[name] === 1 ? "" : "s"}</span></strong></button>`).join("");
  }

  function categoryCounts() {
    return state.recipes.reduce((counts, recipe) => { const key = recipe.category || "Uncategorized"; counts[key] = (counts[key] || 0) + 1; return counts; }, {});
  }

  function updateFilters() {
    const categories = unique(state.recipes.map(r => r.category));
    const contributors = unique(state.recipes.map(r => r.contributor));
    $("#categoryFilter").innerHTML = '<option value="all">All categories</option>' + categories.map(v => `<option>${escapeHTML(v)}</option>`).join("");
    $("#contributorFilter").innerHTML = '<option value="all">All family cooks</option>' + contributors.map(v => `<option>${escapeHTML(v)}</option>`).join("");
  }

  function filteredRecipes() {
    const query = $("#collectionSearch").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const contributor = $("#contributorFilter").value;
    let recipes = [...state.recipes];
    if (state.activeView === "favorites") recipes = recipes.filter(r => state.favorites.has(r.id));
    if (state.activeView === "recent") recipes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (state.filterTag) recipes = recipes.filter(r => (r.tags || []).includes(state.filterTag));
    if (query) recipes = recipes.filter(r => [r.title, r.description, r.category, r.contributor, ...(r.tags || []), ...(r.ingredients || []).flatMap(g => g.items.map(i => i.name))].join(" ").toLowerCase().includes(query));
    if (category !== "all") recipes = recipes.filter(r => r.category === category);
    if (contributor !== "all") recipes = recipes.filter(r => r.contributor === contributor);
    const sort = $("#sortRecipes").value;
    if (sort === "popular") recipes.sort((a,b) => (b.views || 0) - (a.views || 0));
    if (sort === "recent") recipes.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sort === "az") recipes.sort((a,b) => a.title.localeCompare(b.title));
    if (sort === "za") recipes.sort((a,b) => b.title.localeCompare(a.title));
    return recipes;
  }

  function renderCollection() {
    const recipes = filteredRecipes();
    $("#collectionGrid").innerHTML = recipes.map(recipeCard).join("");
    $("#collectionGrid").hidden = !recipes.length;
    $("#emptyState").hidden = Boolean(recipes.length);
    const filters = [];
    if ($("#categoryFilter").value !== "all") filters.push(`Category: ${$("#categoryFilter").value}`);
    if ($("#contributorFilter").value !== "all") filters.push(`Cook: ${$("#contributorFilter").value}`);
    if (state.filterTag) filters.push(`Tag: ${state.filterTag}`);
    $("#activeFilterRow").hidden = !filters.length;
    $("#activeFilterRow").textContent = filters.length ? `Showing ${recipes.length} · ${filters.join(" · ")}` : "";
  }

  function setCollectionHeading(view) {
    const copy = {
      all: ["The whole recipe box", "All recipes", "Everything the family has saved, in one easy-to-search place."],
      favorites: ["Saved for later", "Favorite recipes", "The dishes you want close at hand."],
      recent: ["Fresh from the kitchen", "Recently added", "The newest recipes in the family collection."],
      categories: ["Find the right dish", "Browse categories", "Choose a category or use the filters to narrow the collection."],
      contributors: ["From every branch", "Family cooks", "Find recipes by the person or family branch who shared them."]
    }[view] || ["Recipe box", "Recipes", "Browse the family collection."];
    $("#collectionEyebrow").textContent = copy[0]; $("#collectionTitle").textContent = copy[1]; $("#collectionDescription").textContent = copy[2];
  }

  function setView(view, options = {}) {
    state.activeView = view;
    state.filterTag = options.tag || "";
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    const isHome = view === "home";
    $("#homeView").hidden = !isHome; $("#homeView").classList.toggle("active", isHome);
    $("#collectionView").hidden = isHome; $("#collectionView").classList.toggle("active", !isHome);
    if (!isHome) {
      $("#collectionSearch").value = options.query || "";
      $("#categoryFilter").value = options.category || "all";
      $("#contributorFilter").value = options.contributor || "all";
      setCollectionHeading(view); renderCollection();
    }
    closeMobileMenu();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateCounts() {
    $("#allRecipeCount").textContent = state.recipes.length;
    $("#favoriteCount").textContent = state.favorites.size;
  }

  function toggleFavorite(id) {
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
    updateCounts(); renderHome(); if (state.activeView !== "home") renderCollection();
    if ($("#recipeDialog").open && state.activeRecipeId === id) renderRecipeDetail(id);
    toast(state.favorites.has(id) ? "Saved to favorites." : "Removed from favorites.");
  }

  function parseQuantity(value) {
    if (!value) return null;
    const parts = value.trim().split(/\s+/); let total = 0;
    for (const part of parts) {
      if (part.includes("/")) { const [a,b] = part.split("/").map(Number); if (!b) return null; total += a/b; }
      else if (!Number.isNaN(Number(part))) total += Number(part); else return null;
    }
    return total;
  }

  function formatQuantity(value) {
    if (Number.isInteger(value)) return String(value);
    const whole = Math.floor(value); const fraction = value - whole;
    const fractions = [[.25,"1/4"],[.333,"1/3"],[.5,"1/2"],[.667,"2/3"],[.75,"3/4"]];
    const nearest = fractions.reduce((best, item) => Math.abs(item[0]-fraction) < Math.abs(best[0]-fraction) ? item : best, fractions[0]);
    if (Math.abs(nearest[0] - fraction) < .06) return `${whole ? `${whole} ` : ""}${nearest[1]}`;
    return value.toFixed(1).replace(/\.0$/, "");
  }

  function ingredientHTML(group, scale) {
    return `<section class="ingredient-group"><h3>${escapeHTML(group.name || "Ingredients")}</h3><ul class="ingredient-list">${group.items.map((item, index) => {
      const numeric = parseQuantity(item.quantity); const quantity = numeric === null ? item.quantity : formatQuantity(numeric * scale);
      return `<li><input type="checkbox" aria-label="Mark ${escapeHTML(item.name)} as gathered"><span class="ingredient-amount">${escapeHTML([quantity,item.unit].filter(Boolean).join(" "))}</span><span>${escapeHTML(item.name)}</span></li>`;
    }).join("")}</ul></section>`;
  }

  function renderRecipeDetail(id, servingsOverride) {
    const recipe = state.recipes.find(r => r.id === id); if (!recipe) return;
    state.activeRecipeId = id;
    const servings = servingsOverride || Number(recipe.servings) || 1;
    const scale = servings / (Number(recipe.servings) || 1);
    const favorite = state.favorites.has(id);
    $("#recipeDetail").innerHTML = `
      <header class="detail-hero"><div class="detail-hero-image"><img src="${escapeHTML(recipe.cover || "assets/wonton-soup.webp")}" alt="${escapeHTML(recipe.title)}"></div><div class="detail-hero-copy"><p class="eyebrow">${escapeHTML(recipe.category || "Family recipe")}</p><h1 id="recipeDialogTitle">${escapeHTML(recipe.title)}</h1><p>${escapeHTML(recipe.description || "A recipe from the family collection.")}</p><dl class="quick-facts"><div><dt>Prep</dt><dd>${escapeHTML(recipe.prepTime || "—")}</dd></div><div><dt>Cook</dt><dd>${escapeHTML(recipe.cookTime || "—")}</dd></div><div><dt>Serves</dt><dd>${servings}</dd></div></dl><button class="favorite-button" type="button" data-favorite-id="${escapeHTML(recipe.id)}" aria-pressed="${favorite}" aria-label="${favorite ? "Remove from" : "Add to"} favorites"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20S4 15.6 4 9.4C4 6.4 5.9 5 8.2 5c1.7 0 3 1 3.8 2.2C12.8 6 14.1 5 15.8 5 18.1 5 20 6.4 20 9.4 20 15.6 12 20 12 20Z"/></svg></button></div></header>
      <div class="detail-content"><div><section class="detail-section"><h2>Ingredients</h2><div class="servings-control"><span>Scale for</span><button type="button" data-serving-change="-1" aria-label="Decrease servings">−</button><strong>${servings} servings</strong><button type="button" data-serving-change="1" aria-label="Increase servings">+</button></div>${(recipe.ingredients || []).map(group => ingredientHTML(group, scale)).join("")}</section>${recipe.story ? `<section class="detail-section story-note"><h2>Why we keep it</h2><p>${escapeHTML(recipe.story)}</p></section>` : ""}</div>
      <div><section class="detail-section"><h2>Directions</h2><ol class="direction-list">${(recipe.directions || []).map(step => `<li>${escapeHTML(step)}</li>`).join("")}</ol></section>${recipe.notes ? `<section class="detail-section notes-box"><h2>Cook’s notes</h2><p>${escapeHTML(recipe.notes)}</p></section>` : ""}${(recipe.stepPhotos || []).length ? `<section class="detail-section"><h2>Step photos</h2><div class="step-photo-preview">${recipe.stepPhotos.map(photo => `<img src="${photo}" alt="A step from ${escapeHTML(recipe.title)}">`).join("")}</div></section>` : ""}
      <section class="detail-section comments-section"><h2>Family tips</h2><div class="comments-list">${(recipe.comments || []).length ? recipe.comments.map(comment => `<div class="comment"><strong>${escapeHTML(comment.author)}</strong> <time>${escapeHTML(formatDate(comment.createdAt))}</time><p>${escapeHTML(comment.text)}</p></div>`).join("") : `<p>No tips yet. Add the first helpful note.</p>`}</div><form class="comment-form" data-comment-form><input name="author" required aria-label="Your name" placeholder="Your name"><textarea name="text" required rows="3" aria-label="Family tip" placeholder="Share a substitution, memory, or helpful cooking tip…"></textarea><button class="button button-secondary" type="submit">Add family tip</button></form></section></div></div>`;
  }

  async function openRecipe(id) {
    const recipe = state.recipes.find(r => r.id === id); if (!recipe) return;
    recipe.views = (recipe.views || 0) + 1;
    if (state.store instanceof LocalRecipeStore) await state.store.save(recipe);
    renderRecipeDetail(id);
    $("#recipeDialog").showModal(); document.body.classList.add("dialog-open");
  }

  function closeDialog(dialog) { if (dialog?.open) dialog.close(); if (!$("dialog[open]")) document.body.classList.remove("dialog-open"); }

  function addIngredientRow(container, item = {}) {
    const row = $("#ingredientRowTemplate").content.firstElementChild.cloneNode(true);
    $(".ingredient-quantity", row).value = item.quantity || ""; $(".ingredient-unit", row).value = item.unit || ""; $(".ingredient-name", row).value = item.name || "";
    $(".remove-row", row).addEventListener("click", () => row.remove()); container.append(row);
  }
  function addIngredientGroup(group = { name: "", items: [{}] }) {
    const element = $("#ingredientGroupTemplate").content.firstElementChild.cloneNode(true);
    $(".group-name", element).value = group.name || ""; const rows = $(".ingredient-rows", element);
    (group.items?.length ? group.items : [{}]).forEach(item => addIngredientRow(rows, item));
    $(".add-row-button", element).addEventListener("click", () => addIngredientRow(rows));
    $(".remove-group", element).addEventListener("click", () => element.remove());
    $("#ingredientGroups").append(element);
  }
  function renumberSteps() { $$(".step-editor").forEach((step,index) => $(".step-number", step).textContent = index + 1); }
  function addStep(text = "") {
    const step = $("#stepTemplate").content.firstElementChild.cloneNode(true); $(".step-text", step).value = text;
    $(".remove-step", step).addEventListener("click", () => { step.remove(); renumberSteps(); }); $("#stepEditorList").append(step); renumberSteps();
  }

  function setEditorTab(tab) {
    state.editorTab = tab;
    $$("[data-editor-tab]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.editorTab === tab)));
    $$("[data-editor-panel]").forEach(panel => { panel.hidden = panel.dataset.editorPanel !== tab; panel.classList.toggle("active", panel.dataset.editorPanel === tab); });
    const tabs = ["basics","ingredients","method"]; const index = tabs.indexOf(tab);
    $("#previousEditorButton").hidden = index === 0; $("#nextEditorButton").hidden = index === tabs.length - 1; $("#saveRecipeButton").hidden = index !== tabs.length - 1;
    $("#nextEditorButton").textContent = index === 0 ? "Next: ingredients" : "Next: method & story";
  }

  function setCoverPreview(src) {
    state.currentCover = src || ""; $("#coverPreview").src = src || ""; $("#coverPreview").hidden = !src; $("#coverPlaceholder").hidden = Boolean(src); $("#changePhotoButton").hidden = !src;
  }

  function openEditor(recipe = null) {
    $("#recipeForm").reset(); $("#ingredientGroups").innerHTML = ""; $("#stepEditorList").innerHTML = ""; $("#stepPhotoPreview").innerHTML = "";
    state.currentStepPhotos = []; setCoverPreview("");
    $("#editorTitle").textContent = recipe ? "Edit family recipe" : "Add a new recipe"; $("#recipeId").value = recipe?.id || "";
    if (recipe) {
      $("#recipeTitle").value = recipe.title || ""; $("#recipeDescription").value = recipe.description || ""; $("#prepTime").value = recipe.prepTime || ""; $("#cookTime").value = recipe.cookTime || ""; $("#servings").value = recipe.servings || 4; $("#category").value = recipe.category || ""; $("#contributor").value = recipe.contributor || ""; $("#tags").value = (recipe.tags || []).join(", "); $("#familyStory").value = recipe.story || ""; $("#recipeNotes").value = recipe.notes || ""; setCoverPreview(recipe.cover); state.currentStepPhotos = recipe.stepPhotos || [];
      state.currentStepPhotos.forEach(src => { const img = new Image(); img.src = src; img.alt = "Step photo"; $("#stepPhotoPreview").append(img); });
      (recipe.ingredients || []).forEach(addIngredientGroup); (recipe.directions || []).forEach(addStep);
    } else { addIngredientGroup({ name: "Main ingredients", items: [{},{},{}] }); addStep(); addStep(); $("#servings").value = 4; }
    setEditorTab("basics"); $("#editorDialog").showModal(); document.body.classList.add("dialog-open"); setTimeout(() => $("#recipeTitle").focus(), 50);
  }

  function collectIngredients() {
    return $$(".ingredient-group-editor").map(group => ({ name: $(".group-name",group).value.trim(), items: $$(".ingredient-row",group).map(row => ({ quantity: $(".ingredient-quantity",row).value.trim(), unit: $(".ingredient-unit",row).value.trim(), name: $(".ingredient-name",row).value.trim() })).filter(item => item.name) })).filter(group => group.items.length);
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!$("#recipeTitle").value.trim()) { setEditorTab("basics"); $("#recipeTitle").focus(); toast("Add a recipe title before saving."); return; }
    const existing = state.recipes.find(r => r.id === $("#recipeId").value); const now = new Date().toISOString();
    const recipe = {
      id: existing?.id || `${slugify($("#recipeTitle").value)}-${Date.now().toString().slice(-5)}`,
      title: $("#recipeTitle").value.trim(), description: $("#recipeDescription").value.trim(), cover: state.currentCover || "assets/wonton-soup.webp", stepPhotos: state.currentStepPhotos,
      prepTime: $("#prepTime").value.trim(), cookTime: $("#cookTime").value.trim(), servings: Number($("#servings").value) || 1, category: $("#category").value.trim() || "Uncategorized", tags: $("#tags").value.split(",").map(x => x.trim()).filter(Boolean), contributor: $("#contributor").value.trim() || "Tam family",
      story: $("#familyStory").value.trim(), notes: $("#recipeNotes").value.trim(), ingredients: collectIngredients(), directions: $$(".step-text").map(input => input.value.trim()).filter(Boolean), comments: existing?.comments || [], views: existing?.views || 0, createdAt: existing?.createdAt || now, updatedAt: now
    };
    try {
      await state.store.save(recipe); const index = state.recipes.findIndex(r => r.id === recipe.id); if (index >= 0) state.recipes[index] = recipe; else state.recipes.unshift(recipe);
      closeDialog($("#editorDialog")); updateFilters(); renderHome(); renderCollection(); updateCounts(); toast(existing ? "Recipe updated." : "Recipe added to the box."); openRecipe(recipe.id);
    } catch (error) { toast(error.message || "The recipe could not be saved."); }
  }

  function fileToOptimizedDataURL(file, maxWidth = 1400, quality = .82) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader(); reader.onerror = reject; reader.onload = () => { const image = new Image(); image.onerror = reject; image.onload = () => { const scale = Math.min(1,maxWidth/image.width); const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width*scale); canvas.height = Math.round(image.height*scale); canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height); resolve(canvas.toDataURL("image/jpeg",quality)); }; image.src = reader.result; }; reader.readAsDataURL(file);
    });
  }

  async function handleCoverFile(file) { if (!file?.type.startsWith("image/")) return; const src = await fileToOptimizedDataURL(file); setCoverPreview(src); }
  async function handleStepPhotos(files) { for (const file of [...files].slice(0,6)) { const src = await fileToOptimizedDataURL(file,1000,.78); state.currentStepPhotos.push(src); const img = new Image(); img.src = src; img.alt = "Step photo preview"; $("#stepPhotoPreview").append(img); } }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((resolve,reject) => { const script = document.createElement("script"); script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"; script.onload = resolve; script.onerror = reject; document.head.append(script); });
  }

  async function importRecipeCard(file) {
    const src = await fileToOptimizedDataURL(file,1800,.9); $("#importCardPreview").src = src; $("#extractedText").value = ""; $("#importProgressBar").style.width = "5%"; $("#importStatus").textContent = "Loading text recognition…"; $("#importDialog").showModal();
    try {
      await loadTesseract();
      const result = await window.Tesseract.recognize(src, "eng", { logger: message => { if (message.progress) $("#importProgressBar").style.width = `${Math.round(message.progress*100)}%`; $("#importStatus").textContent = message.status ? `${message.status.charAt(0).toUpperCase()}${message.status.slice(1)}…` : "Reading the card…"; } });
      $("#extractedText").value = result.data.text.trim(); $("#importStatus").textContent = "Text extracted. Review it before using the draft."; $("#importProgressBar").style.width = "100%";
    } catch (error) {
      console.error(error); $("#importStatus").textContent = "Automatic reading is unavailable. Type the card text below and use it as a draft."; $("#importProgressBar").style.width = "100%";
    }
  }

  function applyExtractedText() {
    const text = $("#extractedText").value.trim(); if (!text) { toast("Add or extract some recipe text first."); return; }
    const lines = text.split(/\n/).map(x=>x.trim()).filter(Boolean); if (!$("#recipeTitle").value && lines.length) $("#recipeTitle").value = lines.shift();
    $("#recipeDescription").value = `Imported recipe card draft:\n${lines.slice(0,5).join(" ")}`; $("#recipeNotes").value = lines.join("\n"); closeDialog($("#importDialog")); toast("Card text added. Review the draft and organize its ingredients and steps.");
  }

  async function addComment(form) {
    const recipe = state.recipes.find(r => r.id === state.activeRecipeId); if (!recipe) return;
    const data = new FormData(form); recipe.comments = recipe.comments || []; recipe.comments.push({ author: data.get("author").trim(), text: data.get("text").trim(), createdAt: new Date().toISOString() }); recipe.updatedAt = new Date().toISOString();
    try { await state.store.save(recipe); renderRecipeDetail(recipe.id); toast("Family tip added."); } catch (error) { toast(error.message || "The tip could not be saved."); }
  }

  async function deleteActiveRecipe() {
    const recipe = state.recipes.find(r => r.id === state.activeRecipeId); if (!recipe) return;
    if (!window.confirm(`Delete “${recipe.title}”? This cannot be undone.`)) return;
    try { await state.store.remove(recipe.id); state.recipes = state.recipes.filter(r => r.id !== recipe.id); state.favorites.delete(recipe.id); localStorage.setItem(FAVORITES_KEY,JSON.stringify([...state.favorites])); closeDialog($("#recipeDialog")); updateFilters(); renderHome(); renderCollection(); updateCounts(); toast("Recipe deleted."); } catch (error) { toast(error.message || "The recipe could not be deleted."); }
  }

  function closeMobileMenu() { $("#sidebar").classList.remove("open"); $("#sidebarScrim").hidden = true; $("#mobileMenuButton").setAttribute("aria-expanded","false"); }

  function bindEvents() {
    document.addEventListener("click", event => {
      const add = event.target.closest('[data-action="add-recipe"]'); if (add) return openEditor();
      const open = event.target.closest("[data-open-recipe]"); if (open) return openRecipe(open.dataset.openRecipe);
      const favorite = event.target.closest("[data-favorite-id]"); if (favorite) return toggleFavorite(favorite.dataset.favoriteId);
      const view = event.target.closest("[data-view]"); if (view) return setView(view.dataset.view);
      const viewLink = event.target.closest("[data-view-link]"); if (viewLink) { event.preventDefault(); return setView(viewLink.dataset.viewLink); }
      const category = event.target.closest("[data-category-link]"); if (category) return setView("categories", { category: category.dataset.categoryLink });
      const close = event.target.closest("[data-close-dialog]"); if (close) return closeDialog(close.closest("dialog"));
      const serving = event.target.closest("[data-serving-change]"); if (serving) { const current = Number($(".servings-control strong").textContent.split(" ")[0]); return renderRecipeDetail(state.activeRecipeId, Math.max(1,current+Number(serving.dataset.servingChange))); }
    });
    $$("dialog").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }));
    $("#mobileMenuButton").addEventListener("click", () => { const open = $("#sidebar").classList.toggle("open"); $("#sidebarScrim").hidden = !open; $("#mobileMenuButton").setAttribute("aria-expanded",String(open)); });
    $("#sidebarScrim").addEventListener("click", closeMobileMenu);
    $("#profileButton").addEventListener("click", () => $("#accessDialog").showModal());
    $("#homeSearchForm").addEventListener("submit", event => { event.preventDefault(); setView("all", { query: $("#homeSearch").value }); });
    ["collectionSearch","categoryFilter","contributorFilter","sortRecipes"].forEach(id => $("#"+id).addEventListener(id === "collectionSearch" ? "input" : "change", renderCollection));
    $("#printRecipeButton").addEventListener("click", () => window.print());
    $("#editRecipeButton").addEventListener("click", () => { const recipe = state.recipes.find(r=>r.id===state.activeRecipeId); closeDialog($("#recipeDialog")); openEditor(recipe); });
    $("#deleteRecipeButton").addEventListener("click", deleteActiveRecipe);
    $("#recipeDetail").addEventListener("submit", event => { if (event.target.matches("[data-comment-form]")) { event.preventDefault(); addComment(event.target); } });
    $$("[data-editor-tab]").forEach(button => button.addEventListener("click", () => setEditorTab(button.dataset.editorTab)));
    $("#nextEditorButton").addEventListener("click", () => { if (state.editorTab === "basics") { if (!$("#recipeTitle").reportValidity()) return; setEditorTab("ingredients"); } else setEditorTab("method"); });
    $("#previousEditorButton").addEventListener("click", () => setEditorTab(state.editorTab === "method" ? "ingredients" : "basics"));
    $("#addIngredientGroupButton").addEventListener("click", () => addIngredientGroup()); $("#addStepButton").addEventListener("click", () => addStep());
    $("#recipeForm").addEventListener("submit", saveForm);
    $("#coverPhoto").addEventListener("change", event => handleCoverFile(event.target.files[0])); $("#changePhotoButton").addEventListener("click", () => $("#coverPhoto").click());
    ["dragenter","dragover"].forEach(type => $("#coverDropzone").addEventListener(type, event => { event.preventDefault(); $("#coverDropzone").classList.add("dragging"); }));
    ["dragleave","drop"].forEach(type => $("#coverDropzone").addEventListener(type, event => { event.preventDefault(); $("#coverDropzone").classList.remove("dragging"); if (type === "drop") handleCoverFile(event.dataTransfer.files[0]); }));
    $("#stepPhotos").addEventListener("change", event => handleStepPhotos(event.target.files));
    $("#importCardButton").addEventListener("click", () => $("#cardPhotoInput").click()); $("#cardPhotoInput").addEventListener("change", event => event.target.files[0] && importRecipeCard(event.target.files[0])); $("#useExtractedTextButton").addEventListener("click", applyExtractedText);
    document.addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); const input = state.activeView === "home" ? $("#homeSearch") : $("#collectionSearch"); input.focus(); } if (event.key === "Escape") closeMobileMenu(); });
  }

  async function init() {
    const now = new Date(); $("#monthStamp").textContent = now.toLocaleString("en",{month:"short"}).toUpperCase(); $("#dayStamp").textContent = now.getDate();
    await setupStore(); updateFilters(); renderHome(); renderCollection(); updateCounts(); bindEvents();
  }
  init().catch(error => { console.error(error); toast("The recipe box could not be loaded."); });
})();
