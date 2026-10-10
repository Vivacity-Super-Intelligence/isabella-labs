import { Component,type ReactNode } from 'react';
export default class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="scene-unavailable" role="status">3D rendering is unavailable. Measured results and JSON downloads remain accessible. Use a WebGL2-capable browser.</div>:this.props.children;}
}
