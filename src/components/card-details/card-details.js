import { categoriesDB } from "../../../static/DB/category";
import { productsDB } from "../../../static/DB/products";
import { DivComponent } from "../../common/div-component";
import './card-details.css';

export class CardDetails extends DivComponent {
    constructor(appState) {
        super();
        this.appState = appState;
    }

    #addToCart(product) {
        this.appState.cart.push(product);
    }

    #deleteFromCart(product) {
        this.appState.cart = this.appState.cart.filter(
            b => b._id !== product._id
        );
    }

    getProductId() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        return params.get('id');
    }

    getProduct() {
        const productId = this.getProductId();
        return productsDB.find(p => p._id === productId);
    }

    isInCart(id) {
        return this.appState.cart.some(prod => prod._id == id);
    }

    render() {
        const product = this.getProduct();

        if (!product) {
            return this.app.innerHTML = '<h1>Продукт не найден</h1>';
        }

        this.el.classList.add('card-details');
        this.el.innerHTML = `
            <div class="wrapper">
                <h2>${product.name}</h2>
                <div class="card__wrapper">
                    <img src="images/${product.image}.jpg" />
                    <div class="card__desc">
                        <h3>Название: ${product.name}</h3>
                        <h3>Категория: ${categoriesDB.find(cat => cat._id === product.category).name}</h3>
                        <button class="card__add" >
                            ${this.isInCart(product._id) ? "Удалить с корзины" : "Добавить в корзину"}
                        </button>
                    </div>
                </div>
                <h4> Описание: </h4>
                <h4>${product.description}</h4>
            </div>
        `;
        const button = this.el.querySelector('.card__add');

        if(this.isInCart(product._id)) {
            button.addEventListener('click', e => {
                e.stopPropagation(); 
                this.#deleteFromCart(product);
            });
        } else {
            button.addEventListener('click', e => {
                e.stopPropagation(); 
                this.#addToCart(product);
            });
        }
        return this.el;
    }
}
