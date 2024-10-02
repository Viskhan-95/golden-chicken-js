import { AbstractView } from "../../common/view.js";
import onChange from 'on-change';
import { Header } from "../../components/header/header.js";
import { Search } from "../../components/search/search.js";
import { CardList } from "../../components/card-list/card-list.js";
import { Category } from "../../components/category/category.js";
import { productsDB } from "../../../static/DB/products.js";

export class MainView extends AbstractView {
    state = {
        list: [],
        loading: false,
        searchQuery: undefined,
        category_id: null,
        offset: null,
        countPage: 0,
        countElInPage: 6,
    };

    constructor(appState) {
        super();
        this.appState = appState;
        this.appState = onChange(this.appState, this.appStateHook.bind(this));
        this.state = onChange(this.state, this.stateHook.bind(this));

        this.setTitle('Меню');
        this.state.category_id = 0;
    }

    destroy() {
        onChange.unsubscribe(this.appState);
        onChange.unsubscribe(this.state);
    }

    appStateHook(path) {
        if (path === 'cart') {
            this.render();
        }
    }

    async stateHook(path) {
        if (path === 'searchQuery') {
            this.state.loading = true;
            const data = await this.loadList();
            this.state.loading = false;
            this.state.list = data.filter(food => food.name.toLowerCase().includes(this.state.searchQuery));
            this.state.countPage = Math.ceil(this.state.list.length / this.state.countElInPage);
            this.state.offset = 0; 
        }
    
        if (path === 'category_id') {
            this.state.loading = true;
            const data = await this.loadList();
            this.state.loading = false;
            this.state.offset = 0; 
            this.state.list = this.state.category_id === 0 ? data : data.filter(food => food.category === this.state.category_id);
            this.state.countPage = Math.ceil(this.state.list.length / this.state.countElInPage);
        }
    
        if (path === 'list' || path === 'loading' || path === 'offset') {
            this.state.countPage = Math.ceil(this.state.list.length / this.state.countElInPage); 
            this.render();
        }
    }
    
    async loadList() {
        return productsDB;
    }

    render() {
        const main = document.createElement('div');
        main.append(new Search(this.state).render());
        main.append(new Category(this.state).render());
        main.append(new CardList(this.appState, this.state).render());
        this.app.innerHTML = '';
        this.app.append(main);
        this.renderHeader();
    }

    renderHeader() {
        const header = new Header(this.appState).render();
        this.app.prepend(header);
    }
}
