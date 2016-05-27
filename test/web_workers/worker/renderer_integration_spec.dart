library angular2.test.web_workers.worker.renderer_integration_spec;

import "package:angular2/testing_internal.dart"
    show
        AsyncTestCompleter,
        inject,
        ddescribe,
        describe,
        dispatchEvent,
        it,
        iit,
        expect,
        beforeEach,
        beforeEachProviders,
        TestInjector,
        TestComponentBuilder;
import "package:angular2/src/platform/dom/dom_adapter.dart" show DOM;
import "package:angular2/core.dart"
    show
        bind,
        provide,
        Provider,
        Injector,
        ViewMetadata,
        Component,
        Injectable,
        ElementRef;
import "package:angular2/common.dart" show NgIf;
import "package:angular2/src/web_workers/worker/renderer.dart"
    show WebWorkerRootRenderer;
import "package:angular2/src/web_workers/shared/client_message_broker.dart"
    show
        ClientMessageBrokerFactory,
        ClientMessageBrokerFactory_,
        UiArguments,
        FnArg;
import "package:angular2/src/web_workers/shared/serializer.dart"
    show Serializer;
import "package:angular2/src/core/render/api.dart" show RootRenderer;
import "package:angular2/src/platform/dom/dom_renderer.dart"
    show DomRootRenderer, DomRootRenderer_;
import "package:angular2/src/core/debug/debug_renderer.dart"
    show DebugDomRootRenderer;
import "package:angular2/src/web_workers/shared/render_store.dart"
    show RenderStore;
import "package:angular2/src/web_workers/ui/renderer.dart"
    show MessageBasedRenderer;
import "../shared/web_worker_test_util.dart"
    show createPairedMessageBuses, PairedMessageBuses;
import "package:angular2/src/web_workers/shared/service_message_broker.dart"
    show ServiceMessageBrokerFactory, ServiceMessageBrokerFactory_;
import "package:angular2/compiler.dart" show CompilerConfig;
import "package:angular2/platform/testing/browser.dart"
    show TEST_BROWSER_PLATFORM_PROVIDERS, TEST_BROWSER_APPLICATION_PROVIDERS;

main() {
  ClientMessageBrokerFactory createWebWorkerBrokerFactory(
      PairedMessageBuses messageBuses,
      Serializer workerSerializer,
      Serializer uiSerializer,
      DomRootRenderer domRootRenderer,
      RenderStore uiRenderStore) {
    var uiMessageBus = messageBuses.ui;
    var workerMessageBus = messageBuses.worker;
    // set up the worker side
    var webWorkerBrokerFactory =
        new ClientMessageBrokerFactory_(workerMessageBus, workerSerializer);
    // set up the ui side
    var uiMessageBrokerFactory =
        new ServiceMessageBrokerFactory_(uiMessageBus, uiSerializer);
    var renderer = new MessageBasedRenderer(uiMessageBrokerFactory,
        uiMessageBus, uiSerializer, uiRenderStore, domRootRenderer);
    renderer.start();
    return webWorkerBrokerFactory;
  }
  RootRenderer createWorkerRenderer(
      Serializer workerSerializer,
      Serializer uiSerializer,
      DomRootRenderer domRootRenderer,
      RenderStore uiRenderStore,
      RenderStore workerRenderStore) {
    var messageBuses = createPairedMessageBuses();
    var brokerFactory = createWebWorkerBrokerFactory(messageBuses,
        workerSerializer, uiSerializer, domRootRenderer, uiRenderStore);
    var workerRootRenderer = new WebWorkerRootRenderer(brokerFactory,
        messageBuses.worker, workerSerializer, workerRenderStore);
    return new DebugDomRootRenderer(workerRootRenderer);
  }
  describe("Web Worker Renderer", () {
    Injector uiInjector;
    RenderStore uiRenderStore;
    RenderStore workerRenderStore;
    beforeEachProviders(() {
      uiRenderStore = new RenderStore();
      var testUiInjector = new TestInjector();
      testUiInjector.platformProviders = TEST_BROWSER_PLATFORM_PROVIDERS;
      testUiInjector.applicationProviders = TEST_BROWSER_APPLICATION_PROVIDERS;
      testUiInjector.addProviders([
        Serializer,
        provide(RenderStore, useValue: uiRenderStore),
        provide(DomRootRenderer, useClass: DomRootRenderer_),
        provide(RootRenderer, useExisting: DomRootRenderer)
      ]);
      uiInjector = testUiInjector.createInjector();
      var uiSerializer = uiInjector.get(Serializer);
      var domRootRenderer = uiInjector.get(DomRootRenderer);
      workerRenderStore = new RenderStore();
      return [
        Serializer,
        provide(CompilerConfig,
            useValue: new CompilerConfig(true, true, false)),
        provide(RenderStore, useValue: workerRenderStore),
        provide(RootRenderer, useFactory: (workerSerializer) {
          return createWorkerRenderer(workerSerializer, uiSerializer,
              domRootRenderer, uiRenderStore, workerRenderStore);
        }, deps: [Serializer])
      ];
    });
    getRenderElement(dynamic workerEl) {
      var id = workerRenderStore.serialize(workerEl);
      return uiRenderStore.deserialize(id);
    }
    getRenderer(ElementRef elementRef) {
      return ((elementRef as dynamic)).internalElement.parentView.renderer;
    }
    it(
        "should update text nodes",
        inject([TestComponentBuilder, AsyncTestCompleter],
            (TestComponentBuilder tcb, async) {
          tcb
              .overrideView(
                  MyComp, new ViewMetadata(template: "<div>{{ctxProp}}</div>"))
              .createAsync(MyComp)
              .then((fixture) {
            var renderEl = getRenderElement(fixture.debugElement.nativeElement);
            expect(renderEl).toHaveText("");
            fixture.debugElement.componentInstance.ctxProp = "Hello World!";
            fixture.detectChanges();
            expect(renderEl).toHaveText("Hello World!");
            async.done();
          });
        }));
    it(
        "should update any element property/attributes/class/style independent of the compilation on the root element and other elements",
        inject([TestComponentBuilder, AsyncTestCompleter],
            (TestComponentBuilder tcb, async) {
          tcb
              .overrideView(
                  MyComp,
                  new ViewMetadata(
                      template:
                          "<input [title]=\"y\" style=\"position:absolute\">"))
              .createAsync(MyComp)
              .then((fixture) {
            var checkSetters = (componentElRef, workerEl) {
              var renderer = getRenderer(componentElRef);
              var el = getRenderElement(workerEl);
              renderer.setElementProperty(workerEl, "tabIndex", 1);
              expect(((el as dynamic)).tabIndex).toEqual(1);
              renderer.setElementClass(workerEl, "a", true);
              expect(DOM.hasClass(el, "a")).toBe(true);
              renderer.setElementClass(workerEl, "a", false);
              expect(DOM.hasClass(el, "a")).toBe(false);
              renderer.setElementStyle(workerEl, "width", "10px");
              expect(DOM.getStyle(el, "width")).toEqual("10px");
              renderer.setElementStyle(workerEl, "width", null);
              expect(DOM.getStyle(el, "width")).toEqual("");
              renderer.setElementAttribute(workerEl, "someattr", "someValue");
              expect(DOM.getAttribute(el, "someattr")).toEqual("someValue");
            };
            // root element
            checkSetters(
                fixture.elementRef, fixture.debugElement.nativeElement);
            // nested elements
            checkSetters(fixture.elementRef,
                fixture.debugElement.children[0].nativeElement);
            async.done();
          });
        }));
    it(
        "should update any template comment property/attributes",
        inject([TestComponentBuilder, AsyncTestCompleter],
            (TestComponentBuilder tcb, async) {
          var tpl = "<template [ngIf]=\"ctxBoolProp\"></template>";
          tcb
              .overrideView(
                  MyComp, new ViewMetadata(template: tpl, directives: [NgIf]))
              .createAsync(MyComp)
              .then((fixture) {
            ((fixture.debugElement.componentInstance as MyComp)).ctxBoolProp =
                true;
            fixture.detectChanges();
            var el = getRenderElement(fixture.debugElement.nativeElement);
            expect(DOM.getInnerHTML(el))
                .toContain("\"ng-reflect-ng-if\": \"true\"");
            async.done();
          });
        }));
    it(
        "should add and remove fragments",
        inject([TestComponentBuilder, AsyncTestCompleter],
            (TestComponentBuilder tcb, async) {
          tcb
              .overrideView(
                  MyComp,
                  new ViewMetadata(
                      template:
                          "<template [ngIf]=\"ctxBoolProp\">hello</template>",
                      directives: [NgIf]))
              .createAsync(MyComp)
              .then((fixture) {
            var rootEl = getRenderElement(fixture.debugElement.nativeElement);
            expect(rootEl).toHaveText("");
            fixture.debugElement.componentInstance.ctxBoolProp = true;
            fixture.detectChanges();
            expect(rootEl).toHaveText("hello");
            fixture.debugElement.componentInstance.ctxBoolProp = false;
            fixture.detectChanges();
            expect(rootEl).toHaveText("");
            async.done();
          });
        }));
    if (DOM.supportsDOMEvents()) {
      it(
          "should call actions on the element",
          inject([TestComponentBuilder, AsyncTestCompleter],
              (TestComponentBuilder tcb, async) {
            tcb
                .overrideView(
                    MyComp, new ViewMetadata(template: "<input [title]=\"y\">"))
                .createAsync(MyComp)
                .then((fixture) {
              var el = fixture.debugElement.children[0];
              getRenderer(fixture.elementRef).invokeElementMethod(
                  el.nativeElement, "setAttribute", ["a", "b"]);
              expect(DOM.getAttribute(getRenderElement(el.nativeElement), "a"))
                  .toEqual("b");
              async.done();
            });
          }));
      it(
          "should listen to events",
          inject([TestComponentBuilder, AsyncTestCompleter],
              (TestComponentBuilder tcb, async) {
            tcb
                .overrideView(
                    MyComp,
                    new ViewMetadata(
                        template: "<input (change)=\"ctxNumProp = 1\">"))
                .createAsync(MyComp)
                .then((fixture) {
              var el = fixture.debugElement.children[0];
              dispatchEvent(getRenderElement(el.nativeElement), "change");
              expect(fixture.componentInstance.ctxNumProp).toBe(1);
              fixture.destroy();
              async.done();
            });
          }));
    }
  });
}

@Component(selector: "my-comp", directives: const [])
@Injectable()
class MyComp {
  String ctxProp;
  var ctxNumProp;
  bool ctxBoolProp;
  MyComp() {
    this.ctxProp = "initial value";
    this.ctxNumProp = 0;
    this.ctxBoolProp = false;
  }
  throwError() {
    throw "boom";
  }
}
