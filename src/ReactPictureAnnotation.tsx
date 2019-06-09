import React, { MouseEventHandler } from "react";
import { IAnnotation } from "./Annotation";
import { IAnnotationState } from "./annotation/AnnotationState";
import { DefaultAnnotationState } from "./annotation/DefaultAnnotationState";
import DeleteButton from "./DeleteButton";
import { IShape, IShapeBase, RectShape, shapeStyle } from "./Shape";
import { ITransformer } from "./Transformer";

interface IReactPictureAnnotationProps {
  annotationData?: IAnnotation[];
  selectedId?: string;
  onChange: (annotationData: IAnnotation[]) => void;
  onSelect: (id: string | null) => void;
  width: number;
  height: number;
  image: string;
  inputElement: (
    value: string,
    onChange: (value: string) => void,
    style: React.CSSProperties
  ) => React.ReactElement;
}

interface IStageState {
  scale: number;
  originX: number;
  originY: number;
}

const defaultState: IStageState = {
  scale: 1,
  originX: 0,
  originY: 0
};

export default class ReactPictureAnnotation extends React.Component<
  IReactPictureAnnotationProps
> {
  set selectedId(value: string | null) {
    const { onSelect } = this.props;
    this.selectedIdTrueValue = value;
    onSelect(value);
  }

  get selectedId() {
    return this.selectedIdTrueValue;
  }
  public static defaultProps = {
    inputElement: (
      value: string,
      onChange: (value: string) => void,
      style: React.CSSProperties
    ) => (
      <input
        value={value}
        style={style}
        onChange={e => onChange(e.target.value)}
      />
    )
  };

  public shapes: IShape[] = [];
  public currentTransformer: ITransformer;

  public state = {
    inputPosition: {
      left: 0,
      top: 0
    },
    showInput: false,
    inputComment: ""
  };
  private currentAnnotationData: IAnnotation[] = [];
  private selectedIdTrueValue: string | null;
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private canvas2D?: CanvasRenderingContext2D | null;
  private imageCanvasRef = React.createRef<HTMLCanvasElement>();
  private imageCanvas2D?: CanvasRenderingContext2D | null;
  private currentImageElement?: HTMLImageElement;
  private currentAnnotationState: IAnnotationState = new DefaultAnnotationState(
    this
  );
  private scaleState = defaultState;

  public componentDidMount = () => {
    const currentCanvas = this.canvasRef.current;
    const currentImageCanvas = this.imageCanvasRef.current;
    if (currentCanvas && currentImageCanvas) {
      this.setCanvasDPI();

      this.canvas2D = currentCanvas.getContext("2d");
      this.imageCanvas2D = currentImageCanvas.getContext("2d");
      this.onImageChange();
    }

    this.syncAnnotationData();
    this.syncSelectedId();
  };

  public componentDidUpdate = (preProps: IReactPictureAnnotationProps) => {
    const { width, height, image } = this.props;
    if (preProps.width !== width || preProps.height !== height) {
      this.setCanvasDPI();
      this.onShapeChange();
      this.onImageChange();
    }
    if (preProps.image !== image) {
      if (this.currentImageElement) {
        this.currentImageElement.src = image;
      } else {
        this.onImageChange();
      }
    }

    this.syncAnnotationData();
    this.syncSelectedId();
  };

  public calculateMousePosition = (positionX: number, positionY: number) => {
    const { originX, originY, scale } = this.scaleState;
    return {
      positionX: (positionX - originX) / scale,
      positionY: (positionY - originY) / scale
    };
  };

  public calculateShapePosition = (shapeData: IShapeBase): IShapeBase => {
    const { originX, originY, scale } = this.scaleState;
    const { x, y, width, height } = shapeData;
    return {
      x: x * scale + originX,
      y: y * scale + originY,
      width: width * scale,
      height: height * scale
    };
  };

  public render() {
    const { width, height, inputElement } = this.props;
    const { showInput, inputPosition, inputComment } = this.state;
    return (
      <div className="rp-stage">
        <canvas
          style={{ width, height }}
          className="rp-image"
          ref={this.imageCanvasRef}
          width={width * 2}
          height={height * 2}
        />
        <canvas
          className="rp-shapes"
          style={{ width, height }}
          ref={this.canvasRef}
          width={width * 2}
          height={height * 2}
          onMouseDown={this.onMouseDown}
          onMouseMove={this.onMouseMove}
          onMouseUp={this.onMouseUp}
          onMouseLeave={this.onMouseUp}
          onWheel={this.onWheel}
        />
        {showInput && (
          <div
            className="rp-selected-input"
            style={{
              ...inputPosition,

              boxShadow: `0 0 10px ${shapeStyle.shapeShadowStyle}`
            }}
          >
            {inputElement(inputComment, this.onInputCommentChange, {
              padding: shapeStyle.padding,
              fontSize: shapeStyle.fontSize,
              color: shapeStyle.fontColor,
              border: 0
            })}
            <div className="rp-delete-section">
              <DeleteButton onClick={this.onDelete} />
            </div>
          </div>
        )}
      </div>
    );
  }

  public setAnnotationState = (annotationState: IAnnotationState) => {
    this.currentAnnotationState = annotationState;
  };

  public onShapeChange = () => {
    if (this.canvas2D && this.canvasRef.current) {
      this.canvas2D.clearRect(
        0,
        0,
        this.canvasRef.current.width,
        this.canvasRef.current.height
      );

      let hasSelectedItem = false;

      for (const item of this.shapes) {
        const isSelected = item.getAnnotationData().id === this.selectedId;

        const { x, y, height } = item.paint(
          this.canvas2D,
          this.calculateShapePosition,
          isSelected
        );

        if (isSelected && this.currentTransformer) {
          hasSelectedItem = true;

          this.currentTransformer.paint(
            this.canvas2D,
            this.calculateShapePosition
          );

          this.setState({
            showInput: true,
            inputPosition: {
              left: x,
              top: y + height + shapeStyle.margin
            },
            inputComment: item.getAnnotationData().comment || ""
          });
        }
      }

      if (!hasSelectedItem) {
        this.setState({
          showInput: false,
          inputComment: ""
        });
      }
    }

    this.currentAnnotationData = this.shapes.map(item =>
      item.getAnnotationData()
    );
    const { onChange } = this.props;
    onChange(this.currentAnnotationData);
  };

  private syncAnnotationData = () => {
    const { annotationData } = this.props;
    if (annotationData) {
      const refreshShapesWithAnnotationData = () => {
        this.selectedId = null;
        const nextShapes = annotationData.map(
          eachAnnotationData =>
            new RectShape(eachAnnotationData, this.onShapeChange)
        );
        this.shapes = nextShapes;
        this.onShapeChange();
      };

      if (annotationData.length !== this.shapes.length) {
        refreshShapesWithAnnotationData();
      } else {
        for (const annotationDataItem of annotationData) {
          const targetShape = this.shapes.find(
            item => item.getAnnotationData().id === annotationDataItem.id
          );
          if (targetShape && targetShape.equal(annotationDataItem)) {
            continue;
          } else {
            refreshShapesWithAnnotationData();
            break;
          }
        }
      }
    }
  };

  private syncSelectedId = () => {
    const { selectedId } = this.props;

    if (selectedId && selectedId !== this.selectedId) {
      this.selectedId = selectedId;
    }
  };

  private onDelete = () => {
    if (
      this.shapes.length > 0 &&
      this.shapes[this.shapes.length - 1].getAnnotationData().id ===
        this.selectedId
    ) {
      this.shapes.pop();
      this.onShapeChange();
    }
  };

  private setCanvasDPI = () => {
    const currentCanvas = this.canvasRef.current;
    const currentImageCanvas = this.imageCanvasRef.current;
    if (currentCanvas && currentImageCanvas) {
      const currentCanvas2D = currentCanvas.getContext("2d");
      const currentImageCanvas2D = currentImageCanvas.getContext("2d");
      if (currentCanvas2D && currentImageCanvas2D) {
        currentCanvas2D.scale(2, 2);
        currentImageCanvas2D.scale(2, 2);
      }
    }
  };

  private onInputCommentChange = (comment: string) => {
    const selectedShapeIndex = this.shapes.findIndex(
      item => item.getAnnotationData().id === this.selectedId
    );
    this.shapes[selectedShapeIndex].setComment(comment);
    this.setState({ inputComment: comment });
  };

  private onImageChange = () => {
    if (this.imageCanvas2D && this.imageCanvasRef.current) {
      this.imageCanvas2D.clearRect(
        0,
        0,
        this.imageCanvasRef.current.width,
        this.imageCanvasRef.current.height
      );
      if (this.currentImageElement) {
        const { originX, originY, scale } = this.scaleState;
        this.imageCanvas2D.drawImage(
          this.currentImageElement,
          originX,
          originY,
          this.currentImageElement.width * scale,
          this.currentImageElement.height * scale
        );
      } else {
        const nextImageNode = document.createElement("img");
        nextImageNode.onload = () => {
          this.currentImageElement = nextImageNode;
          this.onImageChange();
        };
        nextImageNode.alt = "";
        nextImageNode.src = this.props.image;
      }
    }
  };

  private onMouseDown: MouseEventHandler<HTMLCanvasElement> = event => {
    const { offsetX, offsetY } = event.nativeEvent;
    const { positionX, positionY } = this.calculateMousePosition(
      offsetX,
      offsetY
    );
    this.currentAnnotationState.onMouseDown(positionX, positionY);
  };

  private onMouseMove: MouseEventHandler<HTMLCanvasElement> = event => {
    const { offsetX, offsetY } = event.nativeEvent;
    const { positionX, positionY } = this.calculateMousePosition(
      offsetX,
      offsetY
    );
    this.currentAnnotationState.onMouseMove(positionX, positionY);
  };

  private onMouseUp: MouseEventHandler<HTMLCanvasElement> = () => {
    this.currentAnnotationState.onMouseUp();
  };

  private onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    // https://stackoverflow.com/a/31133823/9071503
    const { clientHeight, scrollTop, scrollHeight } = event.currentTarget;
    if (clientHeight + scrollTop + event.deltaY > scrollHeight) {
      // event.preventDefault();
      event.currentTarget.scrollTop = scrollHeight;
    } else if (scrollTop + event.deltaY < 0) {
      // event.preventDefault();
      event.currentTarget.scrollTop = 0;
    }

    const { scale: preScale } = this.scaleState;
    this.scaleState.scale += event.deltaY * 0.005;
    if (this.scaleState.scale > 2) {
      this.scaleState.scale = 2;
    }
    if (this.scaleState.scale < 0.4) {
      this.scaleState.scale = 0.4;
    }

    const { originX, originY, scale } = this.scaleState;
    const { offsetX, offsetY } = event.nativeEvent;
    this.scaleState.originX =
      offsetX - ((offsetX - originX) / preScale) * scale;
    this.scaleState.originY =
      offsetY - ((offsetY - originY) / preScale) * scale;

    this.setState({ imageScale: this.scaleState });

    requestAnimationFrame(() => {
      this.onShapeChange();
      this.onImageChange();
    });
  };
}
