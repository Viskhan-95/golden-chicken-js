import { DivComponent } from "../../common/div-component";
import './preloader.css';

export class Preloader extends DivComponent {
    constructor() {
        super();
    }

    render() {
        this.el.innerHTML = `
            <h1 class="h1">Приятного аппетита</h1>
            <div id="cooking">
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div id="area">
                    <div id="sides">
                        <div id="pan"></div>
                        <div id="handle"></div>
                    </div>
                    <div id="pancake">
                        <div id="pastry"></div>
                    </div>
                </div>
            </div>
        `;
        return this.el;
    }
}
