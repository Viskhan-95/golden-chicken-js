import { DivComponent } from "../../common/div-component";
import { Card } from "../card/card";
import { Preloader } from "../preloader/preloader";
import './card-list.css';

export class CardList extends DivComponent {
    constructor(appState, parentState) {
        super();
        this.appState = appState;
        this.parentState = parentState;
    }

    prevPage() {
        if (this.parentState.offset > 0) {
            this.parentState.offset--;
            this.render(); 
        }
    }

    nextPage() {
        if (this.parentState.offset < this.parentState.countPage - 1) {
            this.parentState.offset++;
            this.render(); 
        }
    }

    render() {
        if (this.parentState.loading) {
            const preloader = new Preloader();
            this.el.append(preloader.render());
            return this.el;
        }

        this.el.innerHTML = '';

        const cardGrid = document.createElement('div');
        cardGrid.classList.add('card_grid');
        this.el.append(cardGrid);

        const start = this.parentState.offset * this.parentState.countElInPage;
        const end = start + this.parentState.countElInPage;

        let limitElInPage = this.parentState.list.slice(start, end); 
        
        if(limitElInPage.length == 0) {
            limitElInPage = this.parentState.list
        }

        for (const card of limitElInPage) {
            cardGrid.append(new Card(this.appState, card).render());
        }

        const pagination = document.createElement('div');

        if (this.parentState.list.length > 0 && location.hash !== "#cart") {
            pagination.classList.add('card__pagination');

            const prevButton = document.createElement('button');
            prevButton.classList.add('card__pagination_prev');
            prevButton.innerHTML = `
                <img src="static/arrow-back.svg" />
                Предыдущая страница
            `;
            prevButton.addEventListener('click', this.prevPage.bind(this));

            if (this.parentState.offset === 0) {
                prevButton.classList.add('hidden');
            }
            pagination.append(prevButton);

            const nextButton = document.createElement('button');
            nextButton.classList.add('card__pagination_next');
            nextButton.innerHTML = `
                Следующая страница
                <img src="static/arrow-forth.svg" />
            `;
            nextButton.addEventListener('click', this.nextPage.bind(this));

            if (this.parentState.offset >= this.parentState.countPage - 1) {
                nextButton.classList.add('hidden');
            }
            pagination.append(nextButton);
        }

        this.el.append(pagination);
        return this.el;
    }
}
