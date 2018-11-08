import React, { Component } from 'react';
import { Menu, Icon } from 'antd';

import { Route, Link, Switch, Redirect } from 'react-router-dom';
import All from '../allPlan';
import Finished from '../finishedPlan';
import Todo from '../todoPlan';
import './general.css';
const SubMenu = Menu.SubMenu;
const MenuItemGroup = Menu.ItemGroup;

class General extends Component {
    state = {
        current: 'all',
      }
    
      handleClick = (e) => {
        this.setState({
          current: e.key,
        });
      }
    
      render() {
        return (
            <div>
                <Menu
                    onClick={this.handleClick}
                    selectedKeys={[this.state.current]}
                    className="nav-plans"
                    mode="horizontal"
                >
                    <Menu.Item key="all">
                    <Icon type="file-text" /><Link to="/general/all">所有任务</Link>
                    </Menu.Item>
                    <Menu.Item key="finished" >
                    <Icon type="check-square-o" /><Link to="/general/finished">已完成</Link>
                    </Menu.Item>
                    <Menu.Item key="todo" >
                    <Icon type="clock-circle-o" /><Link to="/general/todo">未完成</Link>
                    </Menu.Item>
                </Menu>
                <div className="plan-panel">
                  <Switch>
                    <Redirect exact from="/general" to="/general/all"></Redirect>
                    <Route path="/general/all" component={ All }></Route>    
                    <Route path="/general/finished" component={ Finished }></Route>    
                    <Route path="/general/todo" component={ Todo }></Route>    
                  </Switch>
                </div>
            </div>
        );
      }
}

export default General;