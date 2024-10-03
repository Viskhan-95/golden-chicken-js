import { DivComponent } from "../../common/div-component";
import './header.css';

export class Header extends DivComponent {
    constructor(appState) {
        super();
        this.appState = appState;
    }

    render() {
        this.el.classList.add('header');
        this.el.innerHTML = `
            <div>
                <img src="/static/logo.png" alt="Логотип" href="#"/>
            </div>
            <div class="menu">
                <a class="menu__item" href="#">
                    <img src="/static/icons/food.svg" alt="Меню иконка" />
                    Меню
                </a>
                <a class="menu__item" href="#cart">
                    <img src="/static/icons/cart.svg" alt="Корзина иконка" />
                    Корзина
                    <div class="menu__counter">
                    ${this.appState?.cart ? this.appState.cart.length : 0}
                    </div>
                </a>
            </div>
        `;
        return this.el;
    }
}
