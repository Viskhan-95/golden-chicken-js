import onChange from "on-change";
import { AbstractView } from "../../common/view";
import { CardDetails } from "../../components/card-details/card-details";
import { Header } from "../../components/header/header";

export class ProductView extends AbstractView {
    constructor(appState) {
        super();
        this.appState = appState;
        this.appState = onChange(this.appState, this.appStateHook.bind(this));
        this.setTitle('О продукте');
    }

    destroy() {
        onChange.unsubscribe(this.appState);
    }

    appStateHook(path) {
        if (path === 'cart') {
            this.render();
        }
    }

    render() {
        const main = document.createElement('div');
        main.append(new CardDetails(this.appState).render());
        this.app.innerHTML = '';
        this.app.append(main);

        this.renderHeader();
    }

    renderHeader() {
        const header = new Header(this.appState).render();
        this.app.prepend(header);
    }
}
