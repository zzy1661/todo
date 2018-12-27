import React, { Component } from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { Row, Col, Button } from 'antd';
import './workbench.css';
import CreateTask from '../../components/CreateTask';
import EditTask from '../../components/EditTask';
import { connect } from 'react-redux';
import {getTasks} from '../../actions/asyncActions';

class Workbench extends Component {

    state = {
        tasks: [],
        taskId: null
    }
    componentDidMount() {
        if (!this.props.username || !this.props.userToken) {
            this.props.removeUser();
            this.props.history.push('/login');
            return;
          }
          this.props.getTasks(this.props.userToken);
    }
    toPlus = () => {
        this.props.history.push('/workbench/create');
    }
    toEdit = (index) => {
        this.props.history.push('/workbench/edit/'+index);
    }

    render() {
        var allTasks = this.props.tasks;
        var rootTasks = allTasks.filter(item=>item.pid===0);
        let taskItems = rootTasks.map(item=>(
            <Col key={item.id} span={6}>
                <div className="media flex-column align-items-center p-1 py-3 bg-primary text-white rounded h-150">
                    <div></div>
                    <div className="h5">{item.name}</div>
                    <p className="mb-1 media-body">{item.describe}</p>
                    <div className="d-flex align-items-center small justify-content-center">
                        <span>2007-12-14 </span>
                        <span className="px-2">~</span>
                        <span>2014-12-06 </span>
                    </div>
                    <div className="mt-2">
                        <Button type="default" className="mr-2" onClick={()=>this.toEdit(item.id)}>编辑</Button>
                        <Button type="danger">删除</Button>
                    </div>
                </div>
            </Col>
        ));
        taskItems.push( (
            <Col key={'add'} span={6}>
                <div className="media flex-column align-items-center justify-content-center p-1 py-3 text-white rounded h-150">
                    <Button type="primary" size="large" onClick={this.toPlus}>+</Button>
                </div>
            </Col>
        ) )
        let workbenchome = (
            <div>
                <header className="workbench-header">
                   <h3>工作台<small className="h6 ml-3">创建/编辑你的任务</small></h3>
                </header>
                <Row gutter={16} className="d-flex flex-wrap">
                {taskItems}
                </Row>
            </div>
        );
        return (         
                <div>
                    <Switch>
                        <Route path="/workbench" exact component={ () => workbenchome }></Route>
                        <Route path="/workbench/edit/:taskId" component={ EditTask }></Route>
                        <Route path="/workbench/create"  component={ CreateTask }></Route>               
                    </Switch>
                </div>           
        )
    }
}



const mapStateToProps = (state) => {
    return {
        username: state.username,
        userToken: state.userToken,
        tasks: state.tasks,
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        getTasks: (token) => {
            return dispatch(getTasks(token));
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(Workbench)
