import { DivComponent } from "../../common/div-component";
import './card.css';

export class Card extends DivComponent {
    constructor(appState, cardState) {
        super();
        this.appState = appState;
        this.cardState = cardState;
    }

    #addToCart() {
        this.appState.cart.push(this.cardState);
    }

    #deleteFromCart() {
        this.appState.cart = this.appState.cart.filter(
            b => b._id !== this.cardState._id
        );
    }

    render() {
        this.el.classList.add('card');
        const existInCart = this.appState.cart.find(b => b._id == this.cardState._id);
        this.el.innerHTML = `
            <div class="card__image" >
                <a href="#product?id=${this.cardState._id}">
                    <img src="images/${this.cardState.image}.jpg" alt="Обложка" />
                </a>
            </div>
            <div class="card__info">
                <div class="card__name">
                    ${this.cardState.name}
                </div>
                <div class="card__price">
                    ${this.cardState.price} Руб
                </div>
                <div class="card__footer">
                    <button class="button__add">
                        ${existInCart 
                            ? '<img src="/static/icons/cart-remove.svg" />'
                            : '<img src="/static/icons/cart.svg" />'
                        }
                    </button>
                </div>
            </div>
        `;
        if (existInCart) {
            this.el.querySelector('button').addEventListener('click', this.#deleteFromCart.bind(this));
        } else {
            this.el.querySelector('button').addEventListener('click', this.#addToCart.bind(this));
        }
        this.el.querySelector('.card__image').addEventListener('click', (e) => {
            e.stopPropagation()
    });
        return this.el;
    }
}
