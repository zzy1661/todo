import React, { Component } from 'react';
import { Route, Switch, Redirect, withRouter } from 'dva/router';

// import WorkbenchHome from '../WorkbenchHome';
// import CreateTask from '../CreateTask';
// import EditTask from '../EditTask';

import './Workbench.css';

class Workbench extends Component {

    state = {
        title: ''
    }

    componentDidMount() {
        this.setState({
            title: this.getTitle(this.props.location.pathname)
        })
    }

    /* shouldComponentUpdate(nextProps,nextState) {
        if(nextState.title === this.state.title) {
            return false;
        }
        return true;
    }
    componentDidUpdate() {
        this.setState({
            title: this.getTitle(this.props.location.pathname)
        })
    } */
    getTitle(path) {
        var reg = /\/workbench\/(\w)+/g;
        var matchRes = reg.exec(path);
        var path = matchRes&&matchRes[1];
        if(!path) {
            return '创建/编辑你的任务';
        }
        if(path==='edit') {
            return '编辑你的任务';
        }
        if(path==='create') {
            return '创建任务'
        }
    }
    render() {

        return (
            <div>
                <header className="workbench-header">
                    <h3>工作台<small className="h6 ml-3">{this.state.title}</small></h3>
                </header>
                {/* <Switch>
                    <Route exact path="/workbench" exact component={WorkbenchHome}></Route>
                    <Route path="/workbench/edit/:taskId" component={EditTask}></Route>
                    <Route path="/workbench/create" component={CreateTask}></Route>
                </Switch> */}
            </div>
        )
    }
}

export default withRouter(Workbench);

