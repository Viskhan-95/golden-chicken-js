import { CartView } from "./views/cart/cart.js";
import { MainView } from "./views/main/main.js";
import { ProductView } from "./views/product/product.js";

class App {
    routes = [
        { path: "", view: MainView },
        { path: "#cart", view: CartView },
        { path: "#product", view: ProductView },
    ];

    appState = {
        cart: [],
    };

    constructor() {
        window.addEventListener('hashchange', this.route.bind(this));
        this.route();
    }

    route() {
        if (this.currentView) {
            this.currentView.destroy();
        }
        const hashPath = location.hash.split('?')[0];
        const view = this.routes.find(r => r.path === hashPath)?.view;
        this.currentView = new view(this.appState);
        this.currentView.render();
    }
}

new App();
